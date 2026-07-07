"use client";
// V5-1 · LIVE MINI-COLLAPSE HERO — an auto-playing ~12s deterministic loop of the
// hero-A structure (fixtureContextGraph): assemble bottom-up → APPLY LOAD (the
// integrity gauge counts 62→6 as the keystone k_credible cracks) → DE-RISK (the
// keystone restores, gauge climbs to ~51) → reset → loop.
//
// V6-1 · the visual renderer is now the shared, deterministic <MiniStructure/> (extracted so the
// DESIGN-tab tournament reuses the exact same node/edge/keystone-crack language). This file keeps
// its bespoke 12s TIMELINE + its hand-placed NODE coordinates verbatim and drives MiniStructure
// from them — zero visual change.
//
// PURE + LOCAL only. It imports the pure engine + context fixtures directly (they carry
// no key, no wall-clock, no randomness — client-safe) and drives the phases from a single
// tick counter advanced by setInterval. It NEVER touches the global keystoneStore, and
// contains NO Math.random / Date.now / new Date( (GOAL T8). Cleanup-safe: the interval is
// cleared on unmount. All displayed numbers are the real engine's output on the fixture.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  applyAttacks,
  detectFailures,
  integrity,
  keystone,
  type Attack,
  type Graph,
} from "@/engine";
import {
  fixtureContextAttacks,
  fixtureContextGraph,
  fixtureDecisionContextPack,
} from "@/context/fixtures";
import { reweightAttacksByContext } from "@/context/weights";
import { BAD, OK, WARN } from "@/ui/tokens";
import { MiniStructure, type MiniPlaced } from "@/ui/MiniStructure";

// ── Timeline (one tick = 80ms · 150 ticks = 12.0s) ──────────────────────────
const TICK_MS = 80;
const TOTAL_TICKS = 150;
// Phase boundaries (ticks).
const LOAD_START = 52;
const LOAD_END = 82;
const COLLAPSE_END = 100;
const DERISK_END = 126;
const HEAL_END = 140; // [140,150) = fade + reset

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

const EMPTY: ReadonlySet<string> = new Set();

// ── Mini-structure layout (a purpose-built stage echoing the canvas visual
// language: hairline edges, mono role tags, red keystone glow + cracks, small
// integrity numeral). Coordinates are in a fixed 700×340 stage. ──────────────
const NODES: MiniPlaced[] = [
  // L2 · assumptions (appear first, bottom-up). Spread across the full stage width and
  // sized tall enough to hold each label in two lines without clipping.
  { id: "k_credible", role: "assumption", tag: "KEYSTONE", label: "Credible staged plan by meeting", cx: 62, cy: 258, w: 108, h: 52, appear: 4 },
  { id: "a_obs", role: "assumption", tag: "ASSUMPTION", label: "Enough observability", cx: 206, cy: 258, w: 108, h: 52, appear: 8 },
  { id: "a_audit", role: "assumption", tag: "ASSUMPTION", label: "Auditability over purity", cx: 350, cy: 258, w: 108, h: 52, appear: 12 },
  { id: "a_bound", role: "assumption", tag: "ASSUMPTION", label: "Clean service boundaries", cx: 494, cy: 258, w: 108, h: 52, appear: 16 },
  { id: "a_load", role: "assumption", tag: "ASSUMPTION", label: "Uneven load across features", cx: 638, cy: 258, w: 108, h: 52, appear: 20 },
  // L1 · claims
  { id: "c_exec", role: "claim", tag: "CLAIM", label: "Execute safely near-term", cx: 150, cy: 145, w: 120, h: 52, appear: 26 },
  { id: "c_reliab", role: "claim", tag: "CLAIM", label: "Meets enterprise reliability", cx: 340, cy: 145, w: 120, h: 52, appear: 30 },
  { id: "c_roi", role: "claim", tag: "CLAIM", label: "Migration ROI justifies it", cx: 510, cy: 145, w: 120, h: 52, appear: 34 },
  // L0 · thesis
  { id: "T", role: "thesis", tag: "THESIS", label: "Migrate to microservices", cx: 340, cy: 32, w: 168, h: 48, appear: 40 },
];

// Real dependency edges (parent → child), verbatim from fixtureContextGraph groups.
const EDGES: [string, string][] = [
  ["T", "c_exec"],
  ["T", "c_reliab"],
  ["T", "c_roi"],
  ["c_exec", "k_credible"],
  ["c_reliab", "k_credible"], // the crux: k_credible carries two claims
  ["c_reliab", "a_obs"],
  ["c_reliab", "a_audit"],
  ["c_roi", "a_bound"],
  ["c_roi", "a_load"],
];

export function MiniCollapseHero({
  fit = false,
  style,
}: {
  /** Scale the 700-wide stage to fit its container (landing hero terminal panel). */
  fit?: boolean;
  /** Passed to the underlying MiniStructure panel (e.g. drop its border when externally framed). */
  style?: CSSProperties;
} = {}) {
  const [tick, setTick] = useState(0);

  // Engine facts (pure, deterministic, computed once). Numbers are the REAL solver output.
  const model = useMemo(() => {
    const graph: Graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();
    const grounded: Attack[] = reweightAttacksByContext(fixtureContextAttacks(), pack.contextWeightAdjustments);
    const baseline = integrity(graph); // ≈ 61.97
    const loaded = applyAttacks(graph, grounded);
    const loadedInt = integrity(loaded); // ≈ 6.38
    const loadedFailed = detectFailures(loaded); // {T, c_exec, c_reliab, k_credible}
    // De-risk = restore the keystone (drop its attack) → the minimal reinforcement.
    const restored = applyAttacks(graph, grounded.filter((a) => a.targetId !== "k_credible"));
    const restoredInt = integrity(restored); // ≈ 50.62
    const key = keystone(graph); // k_credible
    return { baseline, loadedInt, loadedFailed, restoredInt, keystoneId: key?.id ?? "" };
  }, []);

  // Cleanup-safe master clock. No Date/random — a pure modular counter.
  useEffect(() => {
    const h = setInterval(() => setTick((t) => (t + 1) % TOTAL_TICKS), TICK_MS);
    return () => clearInterval(h);
  }, []);

  // ── Derive the whole frame from `tick` ─────────────────────────────────────
  const collapsing = tick >= LOAD_START && tick < COLLAPSE_END; // load + collapsed hold
  const cracked = tick >= LOAD_START + 6 && tick < COLLAPSE_END;

  let gauge: number;
  if (tick < LOAD_START) gauge = model.baseline;
  else if (tick < LOAD_END) gauge = lerp(model.baseline, model.loadedInt, (tick - LOAD_START) / (LOAD_END - LOAD_START));
  else if (tick < COLLAPSE_END) gauge = model.loadedInt;
  else if (tick < DERISK_END) gauge = lerp(model.loadedInt, model.restoredInt, (tick - COLLAPSE_END) / (DERISK_END - COLLAPSE_END));
  else gauge = model.restoredInt;

  const gaugeInt = Math.round(gauge);
  const status = gaugeInt >= 35 ? "HOLDING" : gaugeInt >= 10 ? "STRESSED" : "FAILED";
  const statusColor = gaugeInt >= 35 ? OK : gaugeInt >= 10 ? WARN : BAD;

  const phase =
    tick < 42 ? "ASSEMBLING STRUCTURE"
    : tick < LOAD_START ? "STRUCTURE STANDING"
    : tick < LOAD_END ? "APPLYING LOAD"
    : tick < COLLAPSE_END ? "KEYSTONE FAILED"
    : tick < DERISK_END ? "DE-RISKING · RESTORE KEYSTONE"
    : tick < HEAL_END ? "STRUCTURE RESTORED"
    : "RESET";

  // Overall fade during the reset window, so the loop restarts cleanly.
  const stageOpacity = tick >= HEAL_END ? 1 - (tick - HEAL_END) / (TOTAL_TICKS - HEAL_END) : 1;

  return (
    <MiniStructure
      testId="mini-collapse-hero"
      nodes={NODES}
      edges={EDGES}
      width={700}
      height={340}
      keystoneId={model.keystoneId}
      tick={tick}
      failedIds={collapsing ? model.loadedFailed : EMPTY}
      cracked={cracked}
      stageOpacity={stageOpacity}
      tickMs={TICK_MS}
      readout={{ gaugeInt, status, statusColor, phase }}
      fit={fit}
      style={style}
    />
  );
}
