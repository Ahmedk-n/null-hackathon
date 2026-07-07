"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Attack, CascadeStep, Graph, LoadResultSummary } from "@/engine";
import {
  rankLoadBearing,
  integrity,
  keystone,
  explainKeystone,
  summariseLoadResult,
  supportBreakdown,
  marginalReinforcement,
  failureCascade,
} from "@/engine";
import { MiniStructure, layoutStructure } from "@/ui/MiniStructure";
import { STRATUM_LEVEL } from "@/canvas/depth";
import type { TunnelEvent } from "@/context/tunnel";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
  selectFailures,
} from "@/store/useKeystone";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { analysisDepth } from "@/canvas/depth";
// V4-2 — constraint planes: pure derivation from the pack (deep import; barrel guard).
import { constraintPlanes } from "@/context/constraints";
import { IntegrityGauge } from "@/ui/IntegrityGauge";
import { ContextUsedPanel } from "@/ui/ContextUsedPanel";
import { SectionHeader, Button, EmptyCanvas, LedgerRow } from "@/ui/primitives";
// M-1 — narrow-viewport reflow: below ~820px the fixed rail·canvas·rail row stacks into one
// scrollable column (canvas first, an ANALYSIS/CONTEXT switch swaps the rails beneath it).
import { useIsNarrow, PaneSwitch } from "@/ui/useIsNarrow";
import type { ContextWeightAdjustment, DecisionContextPack } from "@/context";
import type { ReinforcementPlan } from "@/engine";

// Stable empty reference — avoids a fresh [] each render churning the memoized canvas.
const EMPTY_ADJUSTMENTS: readonly ContextWeightAdjustment[] = [];

const RAIL: React.CSSProperties = {
  width: 340,
  minWidth: 340,
  borderRight: "1px solid var(--hair)",
  padding: "var(--pad)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "var(--gap)",
  background: "var(--panel)",
};

const RIGHT: React.CSSProperties = {
  width: 300,
  minWidth: 300,
  borderLeft: "1px solid var(--hair)",
  padding: "var(--pad)",
  overflowY: "auto",
  background: "var(--panel)",
};

// A/B toggle — the demo. IGNORE CONTEXT (raw attacks, structure survives) ⟷
// GROUND IN CONTEXT (hero pack reweights severities, keystone cracks, collapse).
// Terminal/ledger styling: uppercase tracked labels, mono, zero radius.
function ContextToggle({
  grounded,
  onChange,
  disabled,
}: {
  grounded: boolean;
  onChange: (grounded: boolean) => void;
  disabled?: boolean;
}) {
  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 8px",
    fontFamily: "var(--mono)",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textAlign: "center",
    cursor: disabled ? "default" : "pointer",
    border: "none",
    borderRadius: 0,
    background: active ? (grounded ? "var(--bad)" : "var(--ink)") : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
    opacity: disabled ? 0.5 : 1,
  });
  return (
    <div>
      <span className="label" style={{ display: "block", marginBottom: 5 }}>
        Attack Basis
      </span>
      <div
        data-testid="context-toggle"
        style={{ display: "flex", border: "1px solid var(--hair-strong)", borderRadius: 0 }}
      >
        <button
          type="button"
          aria-pressed={!grounded}
          disabled={disabled}
          onClick={() => onChange(false)}
          style={seg(!grounded)}
        >
          Ignore Context
        </button>
        <button
          type="button"
          aria-pressed={grounded}
          disabled={disabled}
          onClick={() => onChange(true)}
          style={seg(grounded)}
        >
          Ground In Context
        </button>
      </div>
    </div>
  );
}

// One attack rendered as a ledger block: CATEGORY (uppercase) + SEVERITY (mono), the
// target's LABEL beneath (looked up from the working graph — the human-readable "what it
// hits", not the raw id), a severity bar (width = severity, red), and — the biggest single
// STRESS win — the attack's own `rationale`: the specific "why this breaks". The label
// truncates (ellipsis, no overflow); the rationale wraps as prose beneath the bar.
function AttackRow({ attack, targetLabel }: { attack: Attack; targetLabel: string }) {
  return (
    <div style={{ borderBottom: "1px solid var(--hair)", padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="label" style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {attack.category}
        </span>
        <span className="mono" style={{ fontSize: 12, color: "var(--bad)", flex: "0 0 auto" }}>
          {attack.severity.toFixed(2)}
        </span>
      </div>
      <div
        className="label"
        title={targetLabel}
        style={{ marginTop: 2, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {"→ " + targetLabel}
      </div>
      <div style={{ marginTop: 5, height: 3, background: "var(--panel-2)" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, attack.severity * 100))}%`,
            background: "var(--bad)",
          }}
        />
      </div>
      {attack.rationale && (
        <div
          data-testid="attack-rationale"
          style={{ marginTop: 5, fontFamily: "var(--sans)", fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}
        >
          {attack.rationale}
        </div>
      )}
    </div>
  );
}

// T4 · SHARED LOAD-SUMMARY SOURCE OF TRUTH — the VERDICT header and the Load Result panel
// must never disagree, so both read from this ONE `useMemo` pair instead of each re-running
// the engine. `summariseLoadResult` re-runs the engine on the clean base graph under the
// effective attacks (baseline → post-load integrity, the drop, whether the keystone SHIFTED,
// which nodes failed); `failureCascade` orders those failures lowest-support-first ("what
// breaks first and why"). Called once in `StressTab` and threaded down as props — nothing
// downstream is allowed to recompute it.
function useLoadSummary(
  baseGraph: Graph | null,
  attacks: Attack[],
): { summary: LoadResultSummary | null; cascade: CascadeStep[] } {
  const summary = useMemo(
    () => (baseGraph ? summariseLoadResult(baseGraph, attacks) : null),
    [baseGraph, attacks],
  );
  const cascade = useMemo(
    () => (baseGraph ? failureCascade(baseGraph, attacks) : []),
    [baseGraph, attacks],
  );
  return { summary, cascade };
}

// T4 · VERDICT HEADER — the "read this first" line at the TOP of the rail: does the
// structure survive the load, and by how much. Every value comes straight off the SAME
// `summary`/`cascade` the Load Result panel renders (see `useLoadSummary` above) — this
// component never touches the engine itself, so the header and the panel can't drift apart.
// Quiet "Awaiting Load" state before a load exists; --bad "Collapses" / --ok "Stands" after.
function VerdictHeader({
  loadApplied,
  baseGraph,
  summary,
  cascade,
}: {
  loadApplied: boolean;
  baseGraph: Graph | null;
  summary: LoadResultSummary | null;
  cascade: CascadeStep[];
}) {
  const labelFor = (id: string | null) =>
    (id && baseGraph?.nodes.find((n) => n.id === id)?.label) || id || "—";

  if (!loadApplied || !summary) {
    return (
      <div data-testid="verdict-header" style={{ padding: "2px 0 10px", borderBottom: "1px solid var(--hair-strong)" }}>
        <span className="label" style={{ color: "var(--muted)" }}>
          Awaiting Load
        </span>
      </div>
    );
  }

  const baseline = summary.baselineIntegrity;
  const post = summary.postLoadIntegrity;
  const survived = post >= summary.threshold * 100;
  const accent = survived ? "var(--ok)" : "var(--bad)";
  const keystoneLabel = labelFor(summary.keystoneBeforeLoad);

  return (
    <div data-testid="verdict-header" style={{ padding: "2px 0 10px", borderBottom: "1px solid var(--hair-strong)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span
          className="mono"
          style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: accent }}
        >
          {survived ? "Stands" : "Collapses"}
        </span>
        <span className="mono" style={{ fontSize: 13, color: accent }}>
          {`${baseline.toFixed(0)}% → ${post.toFixed(0)}%`}
        </span>
      </div>
      <div className="label" style={{ marginTop: 4, color: "var(--ink-2)" }}>
        {`Keystone · ${keystoneLabel} · ${cascade.length} Fell`}
      </div>
    </div>
  );
}

// V7-3 · LOAD RESULT — the collapse, summarised as data. `summary`/`cascade` are passed down
// from `useLoadSummary` in `StressTab` (see above) — NOT recomputed here — so this panel and
// the VERDICT header always agree. Gated on loadApplied by the caller. All labels are looked
// up from the graph (never raw ids); ledger classes keep long labels from overflowing.
function LoadResultPanel({
  baseGraph,
  summary,
  cascade,
}: {
  baseGraph: Graph;
  summary: LoadResultSummary;
  cascade: CascadeStep[];
}) {
  const labelFor = (id: string | null) =>
    (id && baseGraph.nodes.find((n) => n.id === id)?.label) || id || "—";

  const baseline = summary.baselineIntegrity;
  const post = summary.postLoadIntegrity;
  const drop = summary.integrityDrop;
  const survived = post >= summary.threshold * 100;
  const keystoneShifted =
    summary.keystoneBeforeLoad !== summary.keystoneAfterLoad &&
    (summary.keystoneBeforeLoad !== null || summary.keystoneAfterLoad !== null);

  return (
    <div data-testid="load-result">
      <SectionHeader>Load Result</SectionHeader>
      <LedgerRow
        label="Baseline → Post-Load"
        value={`${baseline.toFixed(1)}% → ${post.toFixed(1)}%`}
        accent={survived ? "var(--ok)" : "var(--bad)"}
      />
      <LedgerRow label="Integrity Drop" value={`−${Math.max(0, drop).toFixed(1)}`} accent="var(--bad)" />
      {keystoneShifted && (
        <LedgerRow
          label="Keystone Shift"
          value={`${labelFor(summary.keystoneBeforeLoad)} → ${labelFor(summary.keystoneAfterLoad)}`}
        />
      )}
      {cascade.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <span className="label" style={{ display: "block", marginBottom: 4, color: "var(--bad)" }}>
            Failure Cascade · {cascade.length} Fell
          </span>
          {cascade.map((step, i) => (
            <div
              key={step.id}
              data-testid="cascade-row"
              className="ledger-row"
            >
              <span className="label" title={step.label}>
                {`${i + 1}. ${step.label}`}
              </span>
              <span className="ledger-value mono" style={{ color: "var(--bad)" }}>
                {step.support.toFixed(2)}
              </span>
            </div>
          ))}
          <div className="label" style={{ marginTop: 4, fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}>
            Ordered By Remaining Support · Lowest Breaks First
          </div>
        </div>
      ) : (
        <div className="label" style={{ padding: "6px 0", color: "var(--ok)" }}>
          Structure holds — nothing failed under load
        </div>
      )}
    </div>
  );
}

// W2-1 · KNOCK-OUT SENSITIVITY — the engine's verdict, made visible. For every
// assumption, `rankLoadBearing` re-runs the pure solver with that assumption knocked
// to zero and reports the drop in structural integrity. On the hero structure the
// keystone (`k_credible`) craters integrity ~60pts while the next assumption barely
// moves it ~2pts — that dominance IS why the keystone is the keystone. Rendered as a
// terminal ledger bar chart: uppercase label, mono impact ("−60.0"), hairline bar
// scaled to the max impact, keystone row accented --bad. Data path: pure engine
// function on the clean base graph (no key, deterministic).
function SensitivityBars({ graph, keystoneId }: { graph: Graph | null; keystoneId: string | null }) {
  const ranking = useMemo(() => (graph ? rankLoadBearing(graph) : []), [graph]);
  // V7-3 · deterministic keystone explanation (number-derived sentence + dominance ratio).
  const explanation = useMemo(() => (graph ? explainKeystone(graph) : null), [graph]);
  if (ranking.length === 0) return null;
  const max = Math.max(...ranking.map((r) => Math.abs(r.impact)), 1e-6);
  const ratio = explanation?.impactRatio ?? 0;
  const ratioText = ratio === Infinity ? "∞" : ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1);
  return (
    <div>
      <SectionHeader>Knock-out Sensitivity</SectionHeader>
      {explanation && explanation.keystoneId && (
        <div data-testid="keystone-explanation" style={{ marginBottom: 8 }}>
          <div
            style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--ink-2)", lineHeight: 1.45 }}
          >
            {explanation.explanation}
          </div>
          {explanation.nextImpact > 0 && (
            <span
              className="chip mono"
              data-testid="keystone-ratio"
              style={{ marginTop: 6, display: "inline-block", color: "var(--bad)", borderColor: "var(--bad)" }}
            >
              {`${ratioText}× MORE LOAD-BEARING THAN NEXT`}
            </span>
          )}
        </div>
      )}
      {ranking.map((r, i) => {
        const isKeystone = i === 0 || r.id === keystoneId;
        const accent = isKeystone ? "var(--bad)" : "var(--ink-2)";
        const pct = Math.min(100, Math.max(0, (Math.abs(r.impact) / max) * 100));
        return (
          <div
            key={r.id}
            data-testid="sensitivity-row"
            data-keystone={isKeystone ? "true" : undefined}
            style={{ padding: "6px 0", borderBottom: "1px solid var(--hair)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span className="label" style={isKeystone ? { color: "var(--bad)" } : undefined}>
                {r.label}
              </span>
              <span className="mono" style={{ fontSize: 12, color: accent, flex: "0 0 auto" }}>
                {"−" + Math.abs(r.impact).toFixed(1)}
              </span>
            </div>
            <div style={{ marginTop: 4, height: 2, background: "var(--panel-2)" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: accent }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// W2-2 · DETERMINISTIC RE-RUN — re-executes the engine pipeline on the current
// graph/attacks and flashes a confirmation chip when the verdict is byte-identical.
// The chip auto-clears after ~2s via setTimeout (no wall-clock reads — this is a
// transient UI flag, not a timestamp).
function RerunControl() {
  const confirmed = useKeystone((s) => s.rerunConfirmed);
  const identical = useKeystone((s) => s.rerunIdentical);
  const loadApplied = useKeystone((s) => s.loadApplied);

  useEffect(() => {
    if (!confirmed) return;
    const t = setTimeout(() => keystoneStore.getState().clearRerunConfirmed(), 2000);
    return () => clearTimeout(t);
  }, [confirmed]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Button onClick={() => keystoneStore.getState().rerun()} disabled={!loadApplied}>
        Re-run Analysis
      </Button>
      {confirmed && (
        <span
          data-testid="rerun-chip"
          className="chip mono"
          style={{
            color: identical === false ? "var(--warn)" : "var(--ok)",
            borderColor: identical === false ? "var(--warn)" : "var(--ok)",
            transition: "opacity 0.3s ease",
          }}
        >
          {identical === false ? "DRIFT DETECTED" : "IDENTICAL ✓ DETERMINISTIC"}
        </span>
      )}
    </div>
  );
}

// V3-2 · DE-RISKING PLAN — the inverse money shot. The minimum-reinforcement solver
// (pure engine, exhaustive 2^n search) prescribes the CHEAPEST set of assumptions to
// prove so the structure survives. Rendered as a terminal ledger: one "PROVE · <label>"
// row per targetId, an INTEGRITY before→after row, and a determinism caption. Hairlines,
// zero radius, tabular numerals. Only mounts once `reinforce()` has produced a plan.
function ReinforcementPanel({
  plan,
  baseGraph,
  attacks,
  pack,
}: {
  plan: ReinforcementPlan;
  baseGraph: Graph | null;
  attacks: Attack[];
  pack: DecisionContextPack | null;
}) {
  const labelFor = (id: string) =>
    baseGraph?.nodes.find((n) => n.id === id)?.label ?? id;
  const before = plan.integrityBefore.toFixed(1);
  const after = plan.integrityAfter.toFixed(1);

  // V7-3 · FIRM-UP PAYOFF — the integrity each assumption buys back on the attacked graph.
  // Powers a "+N%" on every PROVE row and names the single highest-payoff assumption to
  // firm up first. Pure engine (marginalReinforcement); recomputed from base + effective attacks.
  const gains = useMemo(
    () => (baseGraph && attacks.length > 0 ? marginalReinforcement(baseGraph, attacks) : []),
    [baseGraph, attacks],
  );
  const gainById = useMemo(() => new Map(gains.map((g) => [g.id, g.gain])), [gains]);
  const firmUpFirst = gains[0] && gains[0].gain > 0 ? gains[0] : null;

  // Harvested idea (founder-a): a VALIDATE-BY line — ONE concrete cheap experiment to prove the
  // keystone, tailored to imminent temporal events. Fetched AFTER mount from /api/reinforce
  // (POST graph+pack → {suggestion, source}); offline / no-key → a deterministic fixture string.
  // NEVER blocks the panel render: nothing shows until the suggestion resolves, and any error is
  // swallowed (the line simply stays hidden).
  const [validateBy, setValidateBy] = useState<string | null>(null);
  useEffect(() => {
    if (!baseGraph) return;
    let live = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/reinforce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph: baseGraph, pack: pack ?? undefined }),
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const { suggestion } = (await res.json()) as { suggestion?: string };
        if (live && typeof suggestion === "string" && suggestion.length > 0) {
          setValidateBy(suggestion);
        }
      } catch {
        /* offline / aborted — leave the line hidden, panel already rendered */
      }
    })();
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [baseGraph, pack]);
  return (
    <div data-testid="derisking-plan">
      <SectionHeader>De-Risking Plan</SectionHeader>
      {plan.reachable && plan.targetIds.length === 0 ? (
        <div className="label" style={{ padding: "8px 0" }}>
          Structure already survives — nothing to prove
        </div>
      ) : plan.reachable ? (
        <>
          {firmUpFirst && (
            <div
              data-testid="firm-up-first"
              className="label"
              style={{ padding: "0 0 6px", color: "var(--bad)", lineHeight: 1.4 }}
            >
              {`Firm Up This First · ${firmUpFirst.label} (+${firmUpFirst.gain.toFixed(1)})`}
            </div>
          )}
          {plan.targetIds.map((id) => {
            const gain = gainById.get(id);
            return (
              <div
                key={id}
                data-testid="prove-row"
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "baseline",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--hair)",
                }}
              >
                <span className="label" style={{ color: "var(--ok)", flex: "0 0 auto" }}>
                  Prove ·
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink)", textTransform: "uppercase", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {labelFor(id)}
                </span>
                {gain != null && gain > 0 && (
                  <span
                    className="mono"
                    data-testid="prove-gain"
                    style={{ fontSize: 11, color: "var(--ok)", flex: "0 0 auto" }}
                  >
                    {`+${gain.toFixed(1)}`}
                  </span>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 6 }}>
            <LedgerRow
              label="Integrity"
              value={`${before}% → ${after}%`}
              accent={plan.integrityAfter >= 35 ? "var(--ok)" : "var(--bad)"}
            />
          </div>
        </>
      ) : (
        <div className="label" style={{ padding: "8px 0", color: "var(--bad)" }}>
          Unreachable — proving every assumption still fails ({after}%)
        </div>
      )}
      {validateBy && (
        <div
          data-testid="validate-by"
          style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--hair)" }}
        >
          <span className="label" style={{ color: "var(--ok)", display: "block", marginBottom: 3 }}>
            Validate By
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {validateBy}
          </span>
        </div>
      )}
      <div
        className="label"
        style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}
      >
        Minimal Set · Exhaustive 2ᴺ Search · Deterministic
      </div>
    </div>
  );
}

// V3-7 · TIME-AXIS STRESS — "your structure FAILS IN N DAYS", scrubbable. A hairline
// scrub slider (0..30 days, zero-radius track — same .ledger-range as ConfidenceSlider)
// drives `setTimelineDay`, which re-derives the temporal attack magnitudes for that day
// and re-runs the engine LIVE (the gauge craters as the modeled deadline approaches).
// The readout chip states the verdict: "FAILS IN N DAYS" (--bad) where N = the first day
// integrity drops below the crater line, or "SURVIVES 30D HORIZON" (--ok) if it never does.
// Only shown once load is applied AND the run is grounded in context (RAW has no time axis).
const TIMELINE_HORIZON = 30;

function TimelineSection() {
  const timelineDay = useKeystone((s) => s.timelineDay);
  const failsInDay = useKeystone((s) => s.failsInDay);
  const fails = failsInDay !== null;
  return (
    <div data-testid="timeline-section">
      <SectionHeader>Timeline Stress</SectionHeader>
      <label style={{ display: "block", marginTop: 4 }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="label">Scrub · Days From Now</span>
          <span className="mono" style={{ fontSize: 11 }}>{`T+${timelineDay}D`}</span>
        </span>
        <input
          type="range"
          className="ledger-range"
          data-testid="timeline-slider"
          aria-label="Timeline day"
          aria-valuetext={`T plus ${timelineDay} day${timelineDay === 1 ? "" : "s"}`}
          min={0}
          max={TIMELINE_HORIZON}
          step={1}
          value={timelineDay}
          onChange={(e) => keystoneStore.getState().setTimelineDay(Number(e.target.value))}
          style={{ width: "100%", marginTop: 4 }}
        />
      </label>
      <span
        data-testid="timeline-chip"
        className="chip mono"
        style={{
          marginTop: 6,
          display: "inline-block",
          textTransform: "uppercase",
          color: fails ? "var(--bad)" : "var(--ok)",
          borderColor: fails ? "var(--bad)" : "var(--ok)",
        }}
      >
        {fails ? `FAILS IN ${failsInDay} DAYS` : `SURVIVES ${TIMELINE_HORIZON}D HORIZON`}
      </span>
    </div>
  );
}

// V6-2 · WIND TUNNEL — two agents duel over a CLONE of the working structure; the pure solver
// referees every round and cannot be overridden. The MAIN verdict/store is UNTOUCHED — the session
// runs on a clone in local component state, streamed from POST /api/tunnel (SSE, gather-shaped). No
// wall-clock / random in this client file: the run deadline is a setTimeout, and every event `ts`
// is stamped by the server. Offline / no key → the deterministic scripted duel for scenario R.
const TUNNEL_DEADLINE_MS = 60_000;

function roleGlyph(role: string): string {
  return role === "PROSECUTOR" ? "PROSECUTOR ▶" : role === "ADVOCATE" ? "ADVOCATE ◀" : "SOLVER ■";
}
function roleColor(role: string): string {
  return role === "PROSECUTOR" ? "var(--bad)" : role === "ADVOCATE" ? "var(--ok)" : "var(--ink)";
}

function TranscriptRow({ event }: { event: TunnelEvent }) {
  if (event.type === "notice") {
    return (
      <div
        data-testid="tunnel-row"
        className="label"
        style={{ padding: "6px 0", color: "var(--warn)", fontStyle: "italic", borderBottom: "1px solid var(--hair)" }}
      >
        {event.message}
      </div>
    );
  }
  if (event.type === "round" || event.type === "done" || event.type === "error") return null;

  let head = "";
  let body = "";
  let accent = roleColor(event.role);
  if (event.type === "proposal") {
    head = `${event.category.toUpperCase()} · SEV ${event.severity.toFixed(2)} → ${event.targetId}`;
    body = event.rationale;
  } else if (event.type === "counter") {
    head = `${event.kind.toUpperCase()} ${event.value.toFixed(2)}${event.targetId ? ` → ${event.targetId}` : ""}`;
    body = event.citation;
  } else {
    // SOLVER verdict.
    const rv = event.verdict;
    head = event.valid
      ? `APPLIED · INTEGRITY ${event.integrity.toFixed(1)}%${rv ? ` · ${rv}` : ""}`
      : `REJECTED · ${event.reason ?? "invalid"}`;
    accent = rv === "CRACK" ? "var(--bad)" : rv === "HOLD" ? "var(--ok)" : event.valid ? "var(--ink)" : "var(--warn)";
  }

  return (
    <div data-testid="tunnel-row" style={{ padding: "6px 0", borderBottom: "1px solid var(--hair)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline" }}>
        <span className="label" style={{ color: roleColor(event.role), flex: "0 0 auto" }}>
          {roleGlyph(event.role)}
        </span>
        <span className="mono" style={{ fontSize: 10, color: accent, textAlign: "right" }}>
          {head}
        </span>
      </div>
      {body && (
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>
          {body}
        </div>
      )}
    </div>
  );
}

function WindTunnelSection({ baseGraph }: { baseGraph: Graph }) {
  const [events, setEvents] = useState<TunnelEvent[]>([]);
  const [running, setRunning] = useState(false);
  const pack = useKeystone((s) => s.decisionContextPack);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const done = events.find((e) => e.type === "done") as
    | Extract<TunnelEvent, { type: "done" }>
    | undefined;

  // Live session integrity — the latest SOLVER verdict, else the clean baseline.
  const liveIntegrity = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "verdict") return e.integrity;
    }
    return integrity(baseGraph);
  }, [events, baseGraph]);

  const keystoneId = useMemo(() => keystone(baseGraph)?.id ?? "", [baseGraph]);
  const layout = useMemo(
    () => layoutStructure(baseGraph, { keystoneId, width: 300, height: 172 }),
    [baseGraph, keystoneId],
  );
  // When the duel ends in a fall, the keystone shows cracked; a stand leaves it whole.
  const fell = done?.verdict === "FALLS";

  async function run() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const deadline = setTimeout(() => controller.abort(), TUNNEL_DEADLINE_MS);
    setEvents([]);
    setRunning(true);
    try {
      const res = await fetch("/api/tunnel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ graph: baseGraph, pack: pack ?? undefined }),
        signal: controller.signal,
      });
      const body = res.body;
      if (!body) return;
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as TunnelEvent;
            setEvents((prev) => [...prev, event]);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch {
      /* aborted / offline — the transcript keeps whatever streamed */
    } finally {
      clearTimeout(deadline);
      setRunning(false);
    }
  }

  const intColor = liveIntegrity >= 35 ? "var(--ok)" : liveIntegrity >= 10 ? "var(--warn)" : "var(--bad)";

  return (
    <div data-testid="wind-tunnel">
      <SectionHeader>Wind Tunnel</SectionHeader>
      <p className="label" style={{ padding: "0 0 6px", color: "var(--muted)", lineHeight: 1.5, textTransform: "none", letterSpacing: 0 }}>
        WIND TUNNEL — two agents argue; the solver referees. Its verdict cannot be overridden.
      </p>
      <Button onClick={run} disabled={running}>
        {running ? "Interrogating…" : "Wind Tunnel"}
      </Button>

      {events.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Session clone — the MAIN structure is never touched. */}
          <MiniStructure
            testId="tunnel-mini"
            nodes={layout.nodes}
            edges={layout.edges}
            width={layout.width}
            height={layout.height}
            keystoneId={keystoneId}
            tick={9999}
            failedIds={fell ? new Set([keystoneId]) : undefined}
            cracked={fell}
          />

          {/* Live session integrity readout. */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span className="label">Session Integrity</span>
            <span data-testid="tunnel-integrity" className="mono" style={{ fontSize: 14, color: intColor }}>
              {liveIntegrity.toFixed(1)}%
            </span>
          </div>

          {/* Role-tagged transcript ledger. */}
          <div>
            {events.map((e, i) => (
              <TranscriptRow key={i} event={e} />
            ))}
          </div>

          {/* Final stamp. */}
          {done && (
            <span
              data-testid="tunnel-verdict"
              className="chip mono"
              style={{
                alignSelf: "flex-start",
                color: done.verdict === "STANDS" ? "var(--ok)" : "var(--bad)",
                borderColor: done.verdict === "STANDS" ? "var(--ok)" : "var(--bad)",
              }}
            >
              {`${done.verdict} (${done.holds} HOLDS / ${done.cracks} CRACKS)`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// T4 · COLLAPSIBLE — folds a deep interrogation tool (Wind Tunnel / Timeline Stress / Re-run)
// behind a native <details>/<summary> so the rail's primary story (verdict → toggle → attacks
// → collapse → keystone → de-risk) reads without scrolling. Same collapsed-by-default, ledger
// toggle treatment as `SupportBreakdownPanel` below: uppercase label left, "+ SHOW"/"− HIDE"
// mono affordance right, hairline-strong divider, default disclosure triangle hidden via
// `.ledger-details` (theme.css). A native <details> only toggles CSS visibility — the wrapped
// content stays mounted (hooks keep running, state persists) even while collapsed.
// Exported so GraphTab reuses the exact same disclosure (its FILTER + ASSUMPTIONS collapses).
export function CollapsibleSection({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="ledger-details"
      data-testid={testId}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "0 0 6px",
          margin: "0 0 6px",
          borderBottom: "1px solid var(--hair-strong)",
        }}
      >
        <span className="label">{label}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          {open ? "− HIDE" : "+ SHOW"}
        </span>
      </summary>
      {children}
    </details>
  );
}

// V7-3 · SUPPORT BREAKDOWN — "why integrity is that number". `supportBreakdown` decomposes
// every node into ownConfidence × dependencyFactor = support with the EXACT aggregation rule
// the solver uses (one source of truth), failed nodes flagged. Laid out bottom-up by strata
// (leaves first — the order the solver fills them), mirroring the LivePipeline treatment.
// Collapsible so it never crowds the rail; deterministic (pure engine, no timers).
function SupportBreakdownPanel({ graph, keystoneId }: { graph: Graph; keystoneId: string | null }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const breakdown = supportBreakdown(graph);
    // Bottom-up: assumptions (deepest) → claims → thesis — the order the solver resolves them.
    return [...breakdown.nodes].sort((a, b) => STRATUM_LEVEL[b.type] - STRATUM_LEVEL[a.type]);
  }, [graph]);

  return (
    <div data-testid="support-breakdown">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--hair-strong)",
          padding: "0 0 6px",
          margin: "0 0 6px",
          cursor: "pointer",
        }}
      >
        <span className="label">Support Breakdown</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          {open ? "− OWN × DEP = SUPPORT" : "+ SHOW"}
        </span>
      </button>
      {open &&
        rows.map((node) => {
          const isKey = node.id === keystoneId;
          return (
            <div
              key={node.id}
              data-testid="support-row"
              className="ledger-row"
              style={{ minHeight: 28 }}
            >
              <span
                className="label"
                title={node.label}
                style={{ color: node.failed ? "var(--bad)" : isKey ? "var(--bad)" : "var(--muted)" }}
              >
                {isKey ? "◆ " : ""}
                {node.label}
              </span>
              <span
                className="ledger-value mono"
                style={{ fontSize: 11, color: node.failed ? "var(--bad)" : "var(--ink)" }}
              >
                {`${node.ownConfidence.toFixed(2)} × ${node.dependencyFactor.toFixed(2)} = ${node.support.toFixed(2)}`}
              </span>
            </div>
          );
        })}
    </div>
  );
}

export function StressTab({
  onApplyLoad,
  onReset,
  onReinforce,
  loading,
}: {
  onApplyLoad: () => void;
  onReset: () => void;
  onReinforce?: () => void;
  loading: boolean;
}) {
  const graph = useKeystone((s) => s.workingGraph);
  const baseGraph = useKeystone((s) => s.baseGraph);
  const attacks = useKeystone((s) => s.attacks);
  const loadApplied = useKeystone((s) => s.loadApplied);
  const keystoneId = useKeystone(selectKeystoneId);
  const failures = useKeystone(selectFailures);
  const integrityValue = useKeystone(selectIntegrity);
  const pack = useKeystone((s) => s.decisionContextPack);
  const source = useKeystone((s) => s.contextSource);
  const applyContextWeights = useKeystone((s) => s.applyContextWeights);
  const rawAttacks = useKeystone((s) => s.rawAttacks);
  const reinforcementPlan = useKeystone((s) => s.reinforcementPlan);

  // Sort by severity desc — highest-impact attack reads first.
  const sorted = useMemo(
    () => [...attacks].sort((a, b) => b.severity - a.severity),
    [attacks],
  );

  // Resolve a node id to its human-readable label (never surface raw ids in the readout).
  const labelFor = (id: string) =>
    (baseGraph ?? graph)?.nodes.find((n) => n.id === id)?.label ?? id;

  // V4-2 — constraint planes for the canvas (strikes derive from the current attacks).
  const planes = useMemo(() => constraintPlanes(pack), [pack]);

  // V4-1 — DEPTH readout (compact) from the clean base structure.
  const depth = useMemo(() => {
    const g = baseGraph ?? graph;
    return g ? analysisDepth(g) : null;
  }, [baseGraph, graph]);

  // T4 — ONE engine read for the whole collapse story. Both the VERDICT header and the Load
  // Result panel render off this single `useLoadSummary` call — see the comment on that hook.
  const { summary: loadSummary, cascade: loadCascade } = useLoadSummary(baseGraph, attacks);

  // M-1 — below ~820px the three-pane row reflows to a single scrollable column: canvas first
  // (explicit height, since it can't be `flex:1` when stacked), then an ANALYSIS/CONTEXT switch
  // that swaps which rail shows beneath it. Desktop (narrow === false, always so on the server
  // and in jsdom) is untouched. `mobilePane` is inert on desktop where both rails render.
  const narrow = useIsNarrow(820);
  const [mobilePane, setMobilePane] = useState<"analysis" | "context">("analysis");
  // Reflow styles. Narrow: full-width rails (fixed widths, min-widths, side borders dropped so
  // nothing exceeds the viewport); canvas gets an explicit height (it can't be `flex:1` stacked).
  const railStyle: React.CSSProperties = narrow
    ? { ...RAIL, width: "100%", minWidth: 0, borderRight: "none", overflowY: "visible" }
    : RAIL;
  const rightStyle: React.CSSProperties = narrow
    ? { ...RIGHT, width: "100%", minWidth: 0, borderLeft: "none", overflowY: "visible" }
    : RIGHT;
  const canvasStyle: React.CSSProperties = narrow
    ? { height: "58vh", minHeight: 320, flex: "0 0 auto", position: "relative" }
    : { flex: 1, minWidth: 0, position: "relative" };

  // LEFT — VERDICT + ATTACK BASIS first (the "read this first" cluster), then the
  // attack/collapse/keystone/de-risk story, deep interrogation tools folded below.
  const leftRail = (
      <div style={railStyle}>
        {/* T4 — VERDICT: one line, top of rail, same numbers as Load Result (never a second
            engine read — see `useLoadSummary`). */}
        <VerdictHeader loadApplied={loadApplied} baseGraph={baseGraph} summary={loadSummary} cascade={loadCascade} />

        {/* T4/S-3 — the demo's fulcrum, elevated: "what's the verdict + what flips it" reads
            as one cluster with the VERDICT header above. */}
        <div>
          <ContextToggle
            grounded={applyContextWeights}
            disabled={loading}
            onChange={(g) => keystoneStore.getState().setApplyContextWeights(g)}
          />
          <div className="label" style={{ marginTop: 6, color: "var(--muted)", fontSize: 10, lineHeight: 1.4 }}>
            Grounding the same attacks in this decision&rsquo;s context cracks the keystone.
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button primary onClick={onApplyLoad} disabled={loading}>
            Apply Load
          </Button>
          <Button onClick={onReset}>Reset</Button>
          {onReinforce && loadApplied && (
            <Button onClick={onReinforce}>Reinforce</Button>
          )}
        </div>

        {/* V4-1 — DEPTH: dimensionality of the analysis (strata + evidence coverage). */}
        {depth && (
          <div data-testid="stress-depth">
            <SectionHeader>Depth</SectionHeader>
            <LedgerRow label="Strata" value={`${depth.strata}/4`} />
            <LedgerRow
              label="Grounded"
              value={`${depth.grounded}/${depth.assumptions}`}
              accent={
                depth.assumptions > 0 && depth.grounded / depth.assumptions >= 0.6
                  ? "var(--ok)"
                  : "var(--warn)"
              }
            />
          </div>
        )}

        <div>
          <SectionHeader>Attack Ledger</SectionHeader>
          {sorted.length === 0 ? (
            <div className="label" style={{ padding: "12px 0" }}>
              Apply load to stress the structure
            </div>
          ) : (
            sorted.map((a) => (
              <AttackRow key={a.id} attack={a} targetLabel={labelFor(a.targetId)} />
            ))
          )}
        </div>

        {/* V7-3 — load-result summary + ordered failure cascade (what breaks first, and why).
            summary/cascade are the SAME values the VERDICT header used above. */}
        {loadApplied && baseGraph && loadSummary && (
          <LoadResultPanel baseGraph={baseGraph} summary={loadSummary} cascade={loadCascade} />
        )}

        {/* W2-1 — knock-out sensitivity ranking (why the keystone is the keystone) */}
        <SensitivityBars graph={baseGraph ?? graph} keystoneId={keystoneId} />

        {/* V3-2 — minimum-reinforcement prescription (the inverse of sensitivity) */}
        {reinforcementPlan && (
          <ReinforcementPanel plan={reinforcementPlan} baseGraph={baseGraph} attacks={attacks} pack={pack} />
        )}

        {/* T4/S-2 — deep interrogation tools, folded below the primary story so the rail
            reads without scrolling. Collapsed by default; content stays mounted (state,
            SSE sessions, timers survive a collapse/expand). */}
        {loadApplied && applyContextWeights && baseGraph && (
          <CollapsibleSection label="Wind Tunnel" testId="wind-tunnel-details">
            <WindTunnelSection baseGraph={baseGraph} />
          </CollapsibleSection>
        )}

        {loadApplied && applyContextWeights && pack && (
          <CollapsibleSection label="Timeline Stress" testId="timeline-details">
            <TimelineSection />
          </CollapsibleSection>
        )}

        <CollapsibleSection label="Re-run" testId="rerun-details">
          <RerunControl />
        </CollapsibleSection>
      </div>
  );

  // CENTER — 3D adaptive canvas + integrity gauge overlay
  const canvasPane = (
      <div style={canvasStyle}>
        {graph ? (
          <KeystoneCanvas
            graph={graph}
            keystoneId={keystoneId}
            failures={failures}
            // T9 — STRESS's collapse view is INTENTIONALLY the perspective strata view, so it
            // pins tilt=true. Previously it read the shared store `tilt`, the same flag GRAPH's
            // old SECTION toggle set — with SECTION gone that coupling is severed here so STRESS
            // renders identically regardless of anything GRAPH does.
            tilt={true}
            loadApplied={loadApplied}
            attacks={attacks}
            rawAttacks={rawAttacks}
            contextAdjustments={pack?.contextWeightAdjustments ?? EMPTY_ADJUSTMENTS}
            constraintPlanes={planes}
            buildKey={baseGraph}
            onSelect={(id) => keystoneStore.getState().setSelectedNode(id)}
          />
        ) : (
          <EmptyCanvas />
        )}
        <div
          style={{
            position: "absolute",
            top: "var(--pad)",
            right: "var(--pad)",
            background: "var(--panel)",
            border: "1px solid var(--hair)",
            padding: 8,
          }}
        >
          <IntegrityGauge value={integrityValue} />
        </div>
      </div>
  );

  // RIGHT — CONTEXT USED + SUPPORT BREAKDOWN (why integrity is that number)
  const rightRail = (
      <div style={rightStyle}>
        {graph && <SupportBreakdownPanel graph={graph} keystoneId={keystoneId} />}
        {pack ? (
          <ContextUsedPanel pack={pack} source={source ?? "fixture"} />
        ) : (
          <div className="label" style={{ padding: "var(--pad)" }}>
            Run analyse to ground the decision
          </div>
        )}
      </div>
  );

  // M-1 — narrow: canvas first, then the ANALYSIS/CONTEXT switch, then the chosen rail, all in
  // one column the ROOT scrolls (root is overflow-y:auto here because <main> is overflow:hidden
  // in KeystoneApp; without this the stacked column can't reach its bottom panel). Desktop keeps
  // the original fixed rail·canvas·rail flex row, unchanged.
  return narrow ? (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {canvasPane}
      <div style={{ padding: "var(--pad) var(--pad) 0" }}>
        <PaneSwitch
          options={[
            { id: "analysis", label: "Analysis" },
            { id: "context", label: "Context" },
          ]}
          value={mobilePane}
          onChange={setMobilePane}
        />
      </div>
      {mobilePane === "analysis" ? leftRail : rightRail}
    </div>
  ) : (
    <div style={{ display: "flex", height: "100%" }}>
      {leftRail}
      {canvasPane}
      {rightRail}
    </div>
  );
}
