"use client";
import { useEffect, useMemo, useState } from "react";
import type { Attack, Graph } from "@/engine";
import { rankLoadBearing } from "@/engine";
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

// One attack rendered as a ledger block: CATEGORY (uppercase) + SEVERITY (mono),
// the target id muted beneath, and a severity bar (width = severity, red).
function AttackRow({ attack }: { attack: Attack }) {
  return (
    <div style={{ borderBottom: "1px solid var(--hair)", padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="label">{attack.category}</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--bad)" }}>
          {attack.severity.toFixed(2)}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
        {attack.targetId}
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
  if (ranking.length === 0) return null;
  const max = Math.max(...ranking.map((r) => Math.abs(r.impact)), 1e-6);
  return (
    <div>
      <SectionHeader>Knock-out Sensitivity</SectionHeader>
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
  pack,
}: {
  plan: ReinforcementPlan;
  baseGraph: Graph | null;
  pack: DecisionContextPack | null;
}) {
  const labelFor = (id: string) =>
    baseGraph?.nodes.find((n) => n.id === id)?.label ?? id;
  const before = plan.integrityBefore.toFixed(1);
  const after = plan.integrityAfter.toFixed(1);

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
          {plan.targetIds.map((id) => (
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
                style={{ fontSize: 11, color: "var(--ink)", textTransform: "uppercase" }}
              >
                {labelFor(id)}
              </span>
            </div>
          ))}
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
  const tilt = useKeystone((s) => s.tilt);
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

  // V4-2 — constraint planes for the canvas (strikes derive from the current attacks).
  const planes = useMemo(() => constraintPlanes(pack), [pack]);

  // V4-1 — DEPTH readout (compact) from the clean base structure.
  const depth = useMemo(() => {
    const g = baseGraph ?? graph;
    return g ? analysisDepth(g) : null;
  }, [baseGraph, graph]);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* LEFT — ATTACK LEDGER + actions */}
      <div style={RAIL}>
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
            sorted.map((a) => <AttackRow key={a.id} attack={a} />)
          )}
        </div>

        {/* W2-1 — knock-out sensitivity ranking (why the keystone is the keystone) */}
        <SensitivityBars graph={baseGraph ?? graph} keystoneId={keystoneId} />

        <ContextToggle
          grounded={applyContextWeights}
          disabled={loading}
          onChange={(g) => keystoneStore.getState().setApplyContextWeights(g)}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button primary onClick={onApplyLoad} disabled={loading}>
            Apply Load
          </Button>
          <Button onClick={onReset}>Reset</Button>
          {onReinforce && loadApplied && (
            <Button onClick={onReinforce}>Reinforce</Button>
          )}
        </div>

        {/* V3-2 — minimum-reinforcement prescription (the inverse of sensitivity) */}
        {reinforcementPlan && (
          <ReinforcementPanel plan={reinforcementPlan} baseGraph={baseGraph} pack={pack} />
        )}

        {/* V3-7 — time-axis stress (grounded only; RAW has no temporal dimension) */}
        {loadApplied && applyContextWeights && pack && <TimelineSection />}

        {/* W2-2 — deterministic re-run beat */}
        <RerunControl />
      </div>

      {/* CENTER — 3D adaptive canvas + integrity gauge overlay */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {graph ? (
          <KeystoneCanvas
            graph={graph}
            keystoneId={keystoneId}
            failures={failures}
            tilt={tilt}
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

      {/* RIGHT — CONTEXT USED */}
      <div style={RIGHT}>
        {pack ? (
          <ContextUsedPanel pack={pack} source={source ?? "fixture"} />
        ) : (
          <div className="label" style={{ padding: "var(--pad)" }}>
            Run analyse to ground the decision
          </div>
        )}
      </div>
    </div>
  );
}
