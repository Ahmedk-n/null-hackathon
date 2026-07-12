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
import { Button, Card, Eyebrow, Pill } from "@/ui/primitives";
import type { PillTone } from "@/ui/primitives";
import { MiniStructure, layoutStructure } from "@/ui/MiniStructure";
import { usePrefersReducedMotion } from "@/ui/useReducedMotion";
import { BAD, OK, WARN } from "@/ui/tokens";

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
// Verdict band → the clean-modern status Pill tone (STANDS green · STRESSED amber · COLLAPSED red).
const bandTone: Record<Band, PillTone> = { STANDS: "hold", STRESSED: "warn", COLLAPSED: "crack" };

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
  // A-3: under prefers-reduced-motion the tournament clock is purely cosmetic replay (the
  // fetch has already resolved by the time it starts) — skip straight to the end tick instead
  // of animating through it, so assemble/collapse/stamp all render their final state at once.
  const reducedMotion = usePrefersReducedMotion();

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
    if (reducedMotion) {
      setTick(TOURN_TOTAL);
      return;
    }
    setTick(0);
    let t = 0;
    const h = setInterval(() => {
      t += 1;
      setTick(t);
      if (t >= TOURN_TOTAL) clearInterval(h);
    }, TICK_MS);
    return () => clearInterval(h);
  }, [runId, reducedMotion]);

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
    <div style={{ height: "100%", overflowY: "auto", padding: 16, background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header — one Eyebrow caption + a plain-language explainer (no page chrome, matching
            the other tabs, which lead straight into their cards). */}
        <div>
          <Eyebrow>Generative Design</Eyebrow>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, margin: "6px 0 0" }}>
            Three rival structures for the same goal, stress-tested under identical load — the solver
            picks the survivor.
          </p>
        </div>

        {/* GOAL + CONSTRAINTS as two clean input Cards. M-2: the `design-io-grid` class collapses
            this to one column below ~700px (theme.css) so the two textareas don't cramp on a phone. */}
        <div className="design-io-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card pad>
            <label style={{ display: "block" }}>
              <Eyebrow style={{ display: "block", marginBottom: 7 }}>Goal</Eyebrow>
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
          </Card>
          <Card pad>
            <label style={{ display: "block" }}>
              <Eyebrow style={{ display: "block", marginBottom: 7 }}>Constraints</Eyebrow>
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
          </Card>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button primary onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate Rivals"}
          </Button>
          <Pill tone={mode === "custom" ? "hold" : "neutral"}>
            {mode === "custom" ? "Live · three lenses in parallel" : "Pinned · deterministic showcase"}
          </Pill>
        </div>

        {/* Tournament — three rival structures as soft cards, each with its verdict Pill. */}
        {verdicts && (
          <div
            data-testid="tournament"
            className="design-tournament"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 4 }}
          >
            {verdicts.map((v, idx) => {
              const isSurvivor = idx === survivorIndex;
              const survivorLit = isSurvivor && settled;
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
                <div
                  key={`${v.lens}-${idx}`}
                  className="panel"
                  data-testid="candidate"
                  data-lens={v.lens}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 16,
                    // The survivor lifts on the single indigo accent once the verdict settles.
                    border: survivorLit ? "1px solid var(--accent)" : undefined,
                    boxShadow: survivorLit
                      ? "var(--shadow), 0 0 0 1px var(--accent)"
                      : undefined,
                    transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                  }}
                >
                  {/* Candidate header — lens eyebrow + source pill. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24 }}>
                    <Eyebrow style={{ color: survivorLit ? "var(--accent)" : undefined, letterSpacing: "0.08em" }}>
                      {LENS_LABEL[v.lens]}
                    </Eyebrow>
                    <span data-testid="candidate-source" data-source={v.source} style={{ marginLeft: "auto" }}>
                      <Pill tone={v.source === "live" ? "accent" : "neutral"} dot={false}>
                        {v.source === "live" ? "LIVE" : "CACHED"}
                      </Pill>
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3, minHeight: 36 }}>
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
                    // The survivor's emphasis now lives on the card's single indigo accent
                    // (border + SURVIVOR pill + primary action), so the mini keeps a plain frame.
                    accented={false}
                    readout={{ gaugeInt, status, statusColor, phase }}
                  />

                  {/* Verdict Pill + OPEN IN STUDIO (revealed once the collapse settles). */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, opacity: settled ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    {settled && (
                      <>
                        <span data-testid="candidate-stamp" data-band={v.band} style={{ display: "inline-flex" }}>
                          <Pill tone={bandTone[v.band]} dot={false}>
                            {bandMark[v.band]}
                          </Pill>
                        </span>
                        {isSurvivor && (
                          <Eyebrow style={{ color: "var(--accent)" }}>Survivor</Eyebrow>
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
          <Card pad style={{ borderStyle: "dashed" }}>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
              Press Generate Rivals to synthesize three rival structures and watch them stress-tested
              side by side.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
