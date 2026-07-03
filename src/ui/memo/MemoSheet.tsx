"use client";
// V5-2 · DECISION MEMO — the printable engineering-drawing sheet for one analysis.
//
// Reads the GLOBAL keystoneStore CLIENT-SIDE and derives every block from the store +
// pure engine/context helpers — NO new state is introduced. This is a "use client" file,
// so it MUST NOT read the wall clock or RNG (the title-block DATE arrives as the
// `startedAt` prop, stamped server-side by page.tsx). T8 wall-clock guard stays green.
import { useMemo } from "react";
import Link from "next/link";
import type { Attack, Graph, ReinforcementPlan } from "@/engine";
import { rankLoadBearing, minimalReinforcement, FAILURE_THRESHOLD } from "@/engine";
import {
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
} from "@/store/useKeystone";
import { constraintPlanes, planeStrikes } from "@/context/constraints";
import { SectionHeader } from "@/ui/primitives";
import {
  statusWord,
  statusAccent,
  provenanceOf,
  provenanceAccent,
} from "./derive";

const SHEET_MAX = 820; // ~A4 width @96dpi

// The @media print rules turn the browser's print dialog into a clean PDF export:
// hide the PRINT control + any nav, force exact colors (paper stays paper), and set A4
// page geometry with sane margins.
const MEMO_CSS = `
.memo-page {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 20px 60px;
  gap: 16px;
}
.memo-sheet {
  width: 100%;
  max-width: ${SHEET_MAX}px;
  min-height: ${Math.round(SHEET_MAX * 1.414)}px;
  background: var(--panel);
  /* double hairline frame */
  border: 1px solid var(--hair-strong);
  box-shadow: 0 0 0 3px var(--panel), 0 0 0 4px var(--hair);
  padding: 34px 38px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.memo-block { break-inside: avoid; }
.memo-reg-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--hair); }
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff; }
  .memo-noprint { display: none !important; }
  .memo-page { padding: 0; background: #fff; min-height: 0; }
  .memo-sheet {
    box-shadow: 0 0 0 3px #fff, 0 0 0 4px var(--hair);
    border-color: var(--hair-strong);
    max-width: none;
    min-height: 0;
  }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

function truncate(text: string, max = 64): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

// ── VERDICT BANNER ───────────────────────────────────────────────────────
function VerdictBanner({
  decision,
  integrity,
  keystoneId,
  keystoneLabel,
}: {
  decision: string;
  integrity: number;
  keystoneId: string | null;
  keystoneLabel: string | null;
}) {
  const word = statusWord(integrity);
  const accent = statusAccent(word);
  return (
    <div
      className="memo-block"
      data-testid="memo-verdict"
      style={{ border: `1px solid var(--hair-strong)`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <span className="label" style={{ letterSpacing: "0.14em" }}>Verdict</span>
      <span style={{ fontFamily: "var(--sans)", fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>
        {decision}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 26, color: accent, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(integrity)}%
        </span>
        <span className="label" style={{ fontSize: 14, color: accent, letterSpacing: "0.16em" }}>
          {word}
        </span>
        <span style={{ flex: 1 }} />
        <span className="label">Keystone</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--keystone)" }}>
          {keystoneLabel ? `${keystoneLabel} · ${keystoneId ?? "—"}` : keystoneId ?? "—"}
        </span>
      </div>
    </div>
  );
}

// ── KNOCK-OUT SENSITIVITY ────────────────────────────────────────────────
function SensitivityTable({ graph, keystoneId }: { graph: Graph; keystoneId: string | null }) {
  const ranking = useMemo(() => rankLoadBearing(graph), [graph]);
  if (ranking.length === 0) return null;
  const max = Math.max(...ranking.map((r) => Math.abs(r.impact)), 1e-6);
  return (
    <div className="memo-block" data-testid="memo-sensitivity">
      <SectionHeader>Knock-out Sensitivity</SectionHeader>
      {ranking.map((r, i) => {
        const isKeystone = i === 0 || r.id === keystoneId;
        const accent = isKeystone ? "var(--bad)" : "var(--ink-2)";
        const pct = Math.min(100, (Math.abs(r.impact) / max) * 100);
        return (
          <div
            key={r.id}
            data-testid="memo-sensitivity-row"
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

// ── DE-RISKING PLAN ──────────────────────────────────────────────────────
function DeRiskingPlan({ plan, baseGraph }: { plan: ReinforcementPlan; baseGraph: Graph }) {
  const labelFor = (id: string) => baseGraph.nodes.find((n) => n.id === id)?.label ?? id;
  const before = plan.integrityBefore.toFixed(1);
  const after = plan.integrityAfter.toFixed(1);
  return (
    <div className="memo-block" data-testid="memo-derisking">
      <SectionHeader>De-Risking Plan</SectionHeader>
      {plan.reachable && plan.targetIds.length === 0 ? (
        <div className="label" style={{ padding: "6px 0" }}>Structure already survives — nothing to prove</div>
      ) : plan.reachable ? (
        <>
          {plan.targetIds.map((id) => (
            <div
              key={id}
              data-testid="memo-prove-row"
              style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid var(--hair)" }}
            >
              <span className="label" style={{ color: "var(--ok)", flex: "0 0 auto" }}>Prove ·</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink)", textTransform: "uppercase" }}>
                {labelFor(id)}
              </span>
            </div>
          ))}
        </>
      ) : (
        <div className="label" style={{ padding: "6px 0", color: "var(--bad)" }}>
          Unreachable — proving every assumption still fails ({after}%)
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", marginTop: 4 }}>
        <span className="label">Integrity</span>
        <span className="mono" style={{ fontSize: 12, color: plan.integrityAfter >= 35 ? "var(--ok)" : "var(--bad)" }}>
          {`${before}% → ${after}%`}
        </span>
      </div>
    </div>
  );
}

// ── CONSTRAINT REGISTER ──────────────────────────────────────────────────
function ConstraintRegister({ pack, attacks }: { pack: Parameters<typeof constraintPlanes>[0]; attacks: Attack[] }) {
  const planes = useMemo(() => constraintPlanes(pack), [pack]);
  const strikes = useMemo(() => planeStrikes(planes, attacks), [planes, attacks]);
  if (planes.length === 0) return null;
  return (
    <div className="memo-block" data-testid="memo-constraints">
      <SectionHeader>Constraint Register</SectionHeader>
      {planes.map((plane, i) => {
        const strike = strikes[i];
        const violated = strike?.struck ?? false;
        return (
          <div key={plane.id} className="memo-reg-row" data-testid="memo-constraint-row">
            <div style={{ minWidth: 0 }}>
              <span className="label">{plane.label}</span>
              <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                {plane.categories.join(" · ")}
              </div>
            </div>
            <span className="mono" style={{ fontSize: 12, color: violated ? "var(--bad)" : "var(--ok)", flex: "0 0 auto" }}>
              {violated ? `VIOLATED ×${strike!.tally}` : "CLEAR"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── EVIDENCE REGISTER ────────────────────────────────────────────────────
function EvidenceRegister({ graph }: { graph: Graph }) {
  const assumptions = graph.nodes.filter((n) => n.type === "assumption");
  if (assumptions.length === 0) return null;
  return (
    <div className="memo-block" data-testid="memo-evidence">
      <SectionHeader>Evidence Register</SectionHeader>
      {assumptions.map((node) => {
        const p = provenanceOf(node);
        return (
          <div key={node.id} data-testid="memo-evidence-row" style={{ padding: "7px 0", borderBottom: "1px solid var(--hair)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span className="label">{node.label}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)", flex: "0 0 auto" }}>
                {Math.round(node.confidence * 100)}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "baseline" }}>
              <span className="label" style={{ color: provenanceAccent(p.state), letterSpacing: "0.1em", flex: "0 0 auto" }}>
                {p.phrase}
              </span>
              {p.fact && (
                <span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>
                  {p.fact} <span style={{ color: "var(--muted)" }}>[{p.source}]</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── TIMELINE LINE ────────────────────────────────────────────────────────
const TIMELINE_HORIZON = 30;
function TimelineLine({ failsInDay }: { failsInDay: number | null }) {
  const fails = failsInDay !== null;
  return (
    <div className="memo-block" data-testid="memo-timeline">
      <SectionHeader>Timeline</SectionHeader>
      <span
        className="mono"
        style={{ fontSize: 13, textTransform: "uppercase", color: fails ? "var(--bad)" : "var(--ok)" }}
      >
        {fails ? `FAILS IN ${failsInDay} DAYS` : `SURVIVES ${TIMELINE_HORIZON}D HORIZON`}
      </span>
    </div>
  );
}

// ── ATTACK LEDGER ────────────────────────────────────────────────────────
function AttackLedger({
  attacks,
  rawAttacks,
  grounded,
}: {
  attacks: Attack[];
  rawAttacks: Attack[];
  grounded: boolean;
}) {
  const rawById = useMemo(() => new Map(rawAttacks.map((a) => [a.id, a])), [rawAttacks]);
  if (attacks.length === 0) return null;
  const sorted = [...attacks].sort((a, b) => b.severity - a.severity);
  return (
    <div className="memo-block" data-testid="memo-attacks">
      <SectionHeader>Attack Ledger</SectionHeader>
      {sorted.map((a) => {
        const raw = rawById.get(a.id);
        const reweighted = grounded && raw && raw.severity.toFixed(2) !== a.severity.toFixed(2);
        return (
          <div key={a.id} className="memo-reg-row" data-testid="memo-attack-row">
            <div style={{ minWidth: 0 }}>
              <span className="label">{a.category}</span>
              <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{a.targetId}</div>
            </div>
            <span className="mono" style={{ fontSize: 12, color: "var(--bad)", flex: "0 0 auto" }}>
              {reweighted ? `${raw!.severity.toFixed(2)} → ${a.severity.toFixed(2)}` : a.severity.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── TITLE BLOCK (bottom-right, classic CAD) ───────────────────────────────
function TitleBlock({
  decision,
  date,
  source,
  integrity,
}: {
  decision: string;
  date: string;
  source: string;
  integrity: number;
}) {
  const word = statusWord(integrity);
  const cell: React.CSSProperties = { padding: "6px 10px", borderTop: "1px solid var(--hair)", display: "flex", justifyContent: "space-between", gap: 10 };
  return (
    <div
      className="memo-block"
      data-testid="memo-title-block"
      style={{ marginTop: "auto", alignSelf: "flex-end", width: 340, border: "1px solid var(--hair-strong)" }}
    >
      <div style={{ padding: "6px 10px", background: "var(--panel-2)", borderBottom: "1px solid var(--hair-strong)" }}>
        <span className="label" style={{ letterSpacing: "0.16em" }}>Project · Keystone</span>
      </div>
      <div style={{ ...cell, borderTop: "none" }}>
        <span className="label">Title</span>
        <span className="mono" style={{ fontSize: 11 }}>{truncate(decision, 34)}</span>
      </div>
      <div style={cell}>
        <span className="label">Date</span>
        <span className="mono" style={{ fontSize: 11 }}>{date}</span>
      </div>
      <div style={cell}>
        <span className="label">Source</span>
        <span className="mono" style={{ fontSize: 11 }}>{source}</span>
      </div>
      <div style={cell}>
        <span className="label">Integrity</span>
        <span className="mono" style={{ fontSize: 11, color: statusAccent(word) }}>{`${Math.round(integrity)}% · ${word}`}</span>
      </div>
      <div style={cell}>
        <span className="label">Sheet</span>
        <span className="mono" style={{ fontSize: 11 }}>1 OF 1</span>
      </div>
      <div style={cell}>
        <span className="label">Drawn By</span>
        <span className="mono" style={{ fontSize: 11 }}>KEYSTONE v0.1</span>
      </div>
    </div>
  );
}

export function MemoSheet({ startedAt }: { startedAt: string }) {
  const workingGraph = useKeystone((s) => s.workingGraph);
  const baseGraph = useKeystone((s) => s.baseGraph);
  const attacks = useKeystone((s) => s.attacks);
  const rawAttacks = useKeystone((s) => s.rawAttacks);
  const applyContextWeights = useKeystone((s) => s.applyContextWeights);
  const reinforcementPlan = useKeystone((s) => s.reinforcementPlan);
  const failsInDay = useKeystone((s) => s.failsInDay);
  const pack = useKeystone((s) => s.decisionContextPack);
  const source = useKeystone((s) => s.contextSource);
  const integrityValue = useKeystone(selectIntegrity);
  const keystoneId = useKeystone(selectKeystoneId);

  const structure = baseGraph ?? workingGraph;

  // De-risking: prefer the store's applied plan; otherwise run the pure solver fresh on
  // the base structure under the (context-effective) attacks currently loaded.
  const plan = useMemo<ReinforcementPlan | null>(() => {
    if (reinforcementPlan) return reinforcementPlan;
    if (!baseGraph || attacks.length === 0) return null;
    return minimalReinforcement(baseGraph, attacks, FAILURE_THRESHOLD * 100);
  }, [reinforcementPlan, baseGraph, attacks]);

  // EMPTY STATE — a full browser reload of /studio/memo empties the in-memory store.
  if (!workingGraph || !structure) {
    return (
      <>
        <style>{MEMO_CSS}</style>
        <div
          className="memo-page"
          data-testid="memo-empty"
          style={{ justifyContent: "center", textAlign: "center", gap: 20 }}
        >
          <span className="label" style={{ letterSpacing: "0.18em", fontSize: 13 }}>
            No Analysis On The Board — Return To Studio
          </span>
          <Link href="/studio" className="btn memo-noprint" style={{ textDecoration: "none" }}>
            Return To Studio
          </Link>
        </div>
      </>
    );
  }

  const keystoneLabel = keystoneId
    ? structure.nodes.find((n) => n.id === keystoneId)?.label ?? null
    : null;
  const thesisLabel = workingGraph.nodes.find((n) => n.id === workingGraph.thesisId)?.label ?? "";
  const decision = pack?.decision ?? thesisLabel;
  const sourceLabel = source ? source.toUpperCase() : "—";

  return (
    <>
      <style>{MEMO_CSS}</style>
      <div className="memo-page">
        <button
          type="button"
          className="btn btn-primary memo-noprint"
          onClick={() => window.print()}
          style={{ alignSelf: "center" }}
        >
          Print / Save As PDF
        </button>

        <div className="memo-sheet" data-testid="memo-sheet">
          <VerdictBanner
            decision={decision}
            integrity={integrityValue}
            keystoneId={keystoneId}
            keystoneLabel={keystoneLabel}
          />
          <SensitivityTable graph={structure} keystoneId={keystoneId} />
          {plan && <DeRiskingPlan plan={plan} baseGraph={baseGraph ?? structure} />}
          <ConstraintRegister pack={pack} attacks={attacks} />
          <EvidenceRegister graph={structure} />
          <TimelineLine failsInDay={failsInDay} />
          <AttackLedger attacks={attacks} rawAttacks={rawAttacks} grounded={applyContextWeights} />
          <TitleBlock decision={decision} date={startedAt} source={sourceLabel} integrity={integrityValue} />
        </div>
      </div>
    </>
  );
}
