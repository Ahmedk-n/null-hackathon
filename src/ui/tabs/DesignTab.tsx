"use client";
// V6-1 · DESIGN tab — GENERATIVE DECISION DESIGN (the headline feature). State a GOAL + CONSTRAINTS,
// press GENERATE RIVALS, and three rival Structures — one per STRATEGY LENS — assemble as
// <MiniStructure/>s, then collapse SIMULTANEOUSLY under identical grounded load. The pure engine
// (client-side) stamps each ✓ STANDS / ⚠ STRESSED / ✗ COLLAPSED and accents the survivor. OPEN IN
// STUDIO seeds the studio store with the chosen structure and jumps to the GRAPH tab.
//
// PURE client: imports the pure engine + the pure context reweight/fixtures (deep paths — never the
// @/context or @/llm barrels, so the key-safety boundary stays green). Reaches the model only via
// fetch to /api/design. NO Math.random / Date.now / new Date( — the tournament clock is a modular
// tick counter (T8).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyAttacks,
  detectFailures,
  integrity,
  keystone,
  type Attack,
  type Graph,
} from "@/engine";
import { reweightAttacksByContext } from "@/context/weights";
import {
  fixtureDecisionContextPackR,
  SCENARIOS,
  type DesignLens,
} from "@/context/fixtures";
import type { ContextMode } from "@/ui/tabs/ContextTab";
import { Button, SectionHeader } from "@/ui/primitives";
import { MiniStructure, layoutStructure } from "@/ui/MiniStructure";
import { BAD, MUTED, OK, WARN } from "@/ui/tokens";

// ── Deterministic tournament clock (one tick = 45ms). ────────────────────────
const TICK_MS = 45;
const LOAD_START = 32; // structures assembled; load begins
const CRACK_AT = 38; // keystones crack / failures reveal
const COLLAPSE_END = 50; // gauges settle at their loaded value
const STAMP_AT = 52; // verdict stamps + OPEN IN STUDIO reveal
const TOURN_TOTAL = 58; // clock stops here

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

const EMPTY: ReadonlySet<string> = new Set();

const LENS_LABEL: Record<DesignLens, string> = {
  aggressive: "AGGRESSIVE · SPEED/UPSIDE",
  conservative: "CONSERVATIVE · DE-RISK",
  hybrid: "HYBRID · STAGED",
};

// The candidate shape returned by POST /api/design.
interface DesignCandidateResp {
  lens: DesignLens;
  label: string;
  graph: Graph;
  attacks: Attack[];
  source: "live" | "fixture";
}

type Band = "STANDS" | "STRESSED" | "COLLAPSED";
const bandOf = (i: number): Band => (i >= 35 ? "STANDS" : i >= 10 ? "STRESSED" : "COLLAPSED");
const bandColor: Record<Band, string> = { STANDS: OK, STRESSED: WARN, COLLAPSED: BAD };
const bandMark: Record<Band, string> = { STANDS: "✓ STANDS", STRESSED: "⚠ STRESSED", COLLAPSED: "✗ COLLAPSED" };

// The goal/constraints seed for a given studio mode. R = the pinned showcase goal (V6-1 §1);
// A/B seed from their scenario decision; custom starts blank.
function seedFor(mode: ContextMode): { goal: string; constraints: string } {
  if (mode === "R") {
    return {
      goal: "Win enterprise collaboration revenue without burning the 6-person team.",
      constraints: fixtureDecisionContextPackR()
        .relevantConstraints.map((c) => `${c.type.toUpperCase()}: ${c.statement}`)
        .join("\n"),
    };
  }
  if (mode === "custom") return { goal: "", constraints: "" };
  return { goal: SCENARIOS[mode].input.decisionText, constraints: "" };
}

export interface OpenCandidate {
  label: string;
  graph: Graph;
  attacks: Attack[];
}

export function DesignTab({
  mode,
  onOpenInStudio,
}: {
  mode: ContextMode;
  onOpenInStudio: (candidate: OpenCandidate) => void;
}) {
  const seed = seedFor(mode);
  const [goal, setGoal] = useState(seed.goal);
  const [constraints, setConstraints] = useState(seed.constraints);
  const [candidates, setCandidates] = useState<DesignCandidateResp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [runId, setRunId] = useState(0);
  const modeRef = useRef(mode);

  // Re-seed the fields when the studio mode changes (mirrors the CONTEXT tab).
  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    const s = seedFor(mode);
    setGoal(s.goal);
    setConstraints(s.constraints);
  }, [mode]);

  const scenarioArg = mode === "custom" ? undefined : mode;
  // The IDENTICAL load every candidate is tested under (the R context weights — a generic
  // near-term enterprise pressure). Pinned candidates always come back for a scenario, so this
  // makes the tournament comparable by construction in every mode.
  const loadPack = useMemo(() => fixtureDecisionContextPackR(), []);
  // Only ground the LIVE generation in R's facts when actually in R mode (a custom live goal must
  // not be fed Excalidraw facts). Pinned scenarios ignore the pack server-side anyway.
  const apiPack = mode === "R" ? loadPack : undefined;

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, constraints, pack: apiPack, scenario: scenarioArg }),
      });
      const { candidates: cands } = (await res.json()) as { candidates: DesignCandidateResp[] };
      setCandidates(cands);
      setRunId((n) => n + 1);
    } catch {
      // Never crash the tab — leave the previous tournament (if any) in place.
    } finally {
      setLoading(false);
    }
  }

  // Deterministic tournament clock — a modular counter, cleared on unmount / next run (T8).
  useEffect(() => {
    if (runId === 0) return;
    setTick(0);
    let t = 0;
    const h = setInterval(() => {
      t += 1;
      setTick(t);
      if (t >= TOURN_TOTAL) clearInterval(h);
    }, TICK_MS);
    return () => clearInterval(h);
  }, [runId]);

  // Per-candidate engine verdicts (raw + grounded) + layout. The LLM never ranks — this is the solver.
  const verdicts = useMemo(() => {
    if (!candidates) return null;
    return candidates.map((c) => {
      const grounded = reweightAttacksByContext(c.attacks, loadPack.contextWeightAdjustments);
      const baseline = integrity(c.graph);
      const loaded = applyAttacks(c.graph, grounded);
      const loadedInt = integrity(loaded);
      const failed = detectFailures(loaded);
      const keystoneId = keystone(c.graph)?.id ?? "";
      const band = bandOf(loadedInt);
      const layout = layoutStructure(c.graph, { keystoneId, width: 320, height: 196 });
      return { ...c, baseline, loadedInt, failed, keystoneId, band, layout };
    });
  }, [candidates, loadPack]);

  // Survivor = the standing candidate with the highest grounded integrity (else the max overall).
  const survivorIndex = useMemo(() => {
    if (!verdicts) return -1;
    const standing = verdicts
      .map((v, i) => ({ i, v }))
      .filter((x) => x.v.band === "STANDS");
    const pool = standing.length ? standing : verdicts.map((v, i) => ({ i, v }));
    return pool.reduce((best, x) => (x.v.loadedInt > best.v.loadedInt ? x : best), pool[0]).i;
  }, [verdicts]);

  const settled = tick >= STAMP_AT;

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "var(--pad)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
        <SectionHeader>Generative Design</SectionHeader>
        <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          GENERATIVE DESIGN — three rival structures for the same goal, stress-tested under identical
          load; the solver picks the survivor.
        </p>

        {/* GOAL + CONSTRAINTS. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap)" }}>
          <label style={{ display: "block" }}>
            <span className="label" style={{ display: "block", marginBottom: 5 }}>
              Goal
            </span>
            <textarea
              className="field-input"
              data-testid="design-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              placeholder="State the decision goal…"
              style={{ fontFamily: "var(--sans)" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="label" style={{ display: "block", marginBottom: 5 }}>
              Constraints
            </span>
            <textarea
              className="field-input"
              data-testid="design-constraints"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={3}
              placeholder="Team size, budget, deadlines, regulatory…"
              style={{ fontFamily: "var(--sans)" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--gap)" }}>
          <Button primary onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate Rivals"}
          </Button>
          <span className="label" style={{ color: MUTED }}>
            {mode === "custom" ? "LIVE — three lenses in parallel" : "PINNED — deterministic showcase"}
          </span>
        </div>

        {/* Tournament. */}
        {verdicts && (
          <div
            data-testid="tournament"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--gap)", marginTop: 4 }}
          >
            {verdicts.map((v, idx) => {
              const isSurvivor = idx === survivorIndex;
              const collapsing = tick >= CRACK_AT;
              const gauge =
                tick < LOAD_START
                  ? v.baseline
                  : tick < COLLAPSE_END
                    ? lerp(v.baseline, v.loadedInt, (tick - LOAD_START) / (COLLAPSE_END - LOAD_START))
                    : v.loadedInt;
              const gaugeInt = Math.round(gauge);
              const liveBand = bandOf(gaugeInt);
              const statusColor = bandColor[liveBand];
              const status = gaugeInt >= 35 ? "HOLDING" : gaugeInt >= 10 ? "STRESSED" : "FAILED";
              const phase =
                tick < LOAD_START ? "ASSEMBLING" : tick < COLLAPSE_END ? "UNDER LOAD" : bandMark[v.band];
              return (
                <div key={`${v.lens}-${idx}`} data-testid="candidate" data-lens={v.lens} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Candidate header — lens + name + source chip. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minHeight: 34 }}>
                    <span className="label" style={{ color: isSurvivor ? "var(--keystone)" : "var(--muted)", letterSpacing: "0.1em" }}>
                      {LENS_LABEL[v.lens]}
                    </span>
                    <span
                      className="chip"
                      data-testid="candidate-source"
                      data-source={v.source}
                      style={{ marginLeft: "auto" }}
                    >
                      {v.source === "live" ? "LIVE" : "CACHED"}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink)", minHeight: 30 }}>
                    {v.label}
                  </div>

                  <MiniStructure
                    testId="candidate-mini"
                    nodes={v.layout.nodes}
                    edges={v.layout.edges}
                    width={v.layout.width}
                    height={v.layout.height}
                    keystoneId={v.keystoneId}
                    tick={tick}
                    failedIds={collapsing ? v.failed : EMPTY}
                    cracked={collapsing}
                    tickMs={TICK_MS}
                    accented={isSurvivor && settled}
                    readout={{ gaugeInt, status, statusColor, phase }}
                  />

                  {/* Verdict stamp + OPEN IN STUDIO (revealed once the collapse settles). */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 34, opacity: settled ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    {settled && (
                      <>
                        <span
                          data-testid="candidate-stamp"
                          data-band={v.band}
                          className="chip"
                          style={{ color: bandColor[v.band], borderColor: bandColor[v.band], fontSize: 12, padding: "3px 10px" }}
                        >
                          {bandMark[v.band]}
                        </span>
                        {isSurvivor && (
                          <span className="label" style={{ color: "var(--keystone)" }}>
                            SURVIVOR
                          </span>
                        )}
                        <Button
                          primary={isSurvivor}
                          onClick={() => onOpenInStudio({ label: v.label, graph: v.graph, attacks: v.attacks })}
                          style={{ marginLeft: "auto" }}
                        >
                          <span data-testid="open-in-studio" data-survivor={isSurvivor ? "true" : "false"}>
                            Open in Studio
                          </span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!verdicts && (
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: "8px 0 0" }}>
            Press GENERATE RIVALS to synthesize three rival structures and watch them stress-tested
            side by side.
          </p>
        )}
      </div>
    </div>
  );
}
