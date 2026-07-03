// V3-7 · TIME-AXIS STRESS — "your structure FAILS IN N DAYS", scrubbable.
//
// PURE + DETERMINISTIC. No react/store imports; NEVER reads the wall clock and
// uses no randomness — day arithmetic is purely relative. Builds ON TOP of the frozen
// `reweightAttacksByContext` (weights.ts) — it does not touch it. Context→engine
// is the one-directional boundary, so importing engine *functions* here is fine
// (engine never imports context).
//
// ── The time model (pinned semantics) ─────────────────────────────────────
// The pack's temporal adjustments (the "meeting tomorrow" beat) already encode
// the FULL near-term pressure. This module parametrises that pressure by a scrub
// offset `day` ("days from now", slider 0..horizon) and asks the engine, at each
// day, "is the structure below the failure line?".
//
// `magnitudeAt(daysUntil, base)` — temporal decay curve. An event's weight is at
//   FULL `base` when it is ≤1 day away and decays LINEARLY to 0 once it is ≥14
//   days out (the two-week planning window). Chosen because a "meeting tomorrow"
//   should bite at full strength while anything a fortnight out is background
//   noise; linear (not exponential) so the scrub reads as an even ramp.
//     factor = clamp01((14 − daysUntil) / 13);  magnitude = clamp01(base · factor)
//
// `adjustmentsAt(pack, day)` — recompute each TEMPORAL adjustment's magnitude for
//   the scrubbed `day`; NON-temporal adjustments pass through unchanged.
//
//   DEVIATION (documented): `DecisionContextPack`/`UpcomingEvent` carry only a
//   natural-language `dateDescription` ("tomorrow") — no numeric proximity field —
//   and types.ts is owned by V3-3, so we cannot add one. We therefore derive the
//   day→magnitude mapping purely in this module from the pack's relative shape:
//     • an adjustment is TEMPORAL iff its category is event/deadline-driven
//       (timeline / execution / reliability / auditability — the categories a
//       near-term meeting amplifies; the hero pack's four are exactly these);
//     • the modeled deadline sits at the FAR edge of the 14-day window, and each
//       scrub day advances toward it:  daysUntil(day) = 14 − day.
//   So day 0 → the deadline is a fortnight out → temporal magnitude ≈ 0 (raw
//   attacks, structure holds); day ≥13 → deadline imminent → full stored
//   magnitude (the collapse). Pressure BUILDS as the horizon advances — the
//   "clock is running / the date you fail if you don't act" reading. This flips
//   the direction of the plan's throw-away suggestion `magnitudeAt(day+1, base)`
//   (which decays with day and would make "first day below threshold" trivially
//   day 0); growing pressure is what makes the slider + "FAILS IN N DAYS" chip
//   meaningful. Never reads the wall clock — arithmetic is purely relative.
//
// `failsInDays(base, rawAttacks, pack, threshold, horizon=30)` — scans day 0..H
//   ASCENDING and returns the FIRST (smallest) day at which structural integrity
//   drops below `threshold` (the structure is healthy for days 0..N−1 and fails
//   from day N = "FAILS IN N DAYS"), or null if it survives the whole horizon
//   ("SURVIVES {H}D HORIZON"). Pinned: hero A grounded (CRATER_THRESHOLD 10) → 8;
//   scenario B → null.
//
// Relationship to "Apply Load": the store's applyLoad realises the FULL pack
// magnitudes (the pinned money-shot collapse) — that is the deadline-reached end of
// the window (equivalent to day ≥13 here). The timeline scrub then DECOMPOSES that
// stress across the runway: the working graph holds at T+0D and craters as the day
// advances to the modeled deadline. So the initial post-load frame shows the
// full-pressure collapse while the scrub sits at 0; the first drag recomputes the
// graph for that day. (applyLoad is intentionally left unchanged — the collapse-on-
// load beat and its pinned <10% integrity test must stay green.)
import type { Attack, Graph } from "@/engine";
import { applyAttacks, integrity } from "@/engine";
import { reweightAttacksByContext, clamp01 } from "./weights";
import type {
  ContextWeightAdjustment,
  DecisionContextPack,
  WeightCategory,
} from "./types";

/** The two-week temporal decay window: full weight ≤1d out, zero at ≥14d out. */
export const DECAY_WINDOW_DAYS = 14;

/**
 * Integrity% "cratered" line used by the timeline (GOAL §4 / success-criteria
 * "<10%"). Deliberately DISTINCT from the per-node support threshold (0.35):
 * the hero's RAW integrity is ~17% with the keystone still holding ("survives"),
 * so the timeline's failure line sits below that, between raw-survive (17%) and
 * full-collapse (6.4%).
 */
export const CRATER_THRESHOLD = 10;

/**
 * Categories a near-term event/deadline amplifies — treated as TEMPORAL, so their
 * magnitudes scale with the scrub day. Everything else (market / competitor /
 * opportunity_cost / technical) is time-invariant and passes through unchanged.
 */
const TEMPORAL_CATEGORIES: ReadonlySet<WeightCategory> = new Set<WeightCategory>([
  "timeline",
  "execution",
  "reliability",
  "auditability",
]);

/**
 * Temporal decay of a weight magnitude by an event's distance in days.
 * Full `baseMagnitude` when `daysUntil ≤ 1`, linear decay to 0 at `daysUntil ≥ 14`.
 * Total + pure + clamped to [0,1]. daysUntil may be any real (negative → full).
 */
export function magnitudeAt(daysUntil: number, baseMagnitude: number): number {
  const factor = clamp01((DECAY_WINDOW_DAYS - daysUntil) / (DECAY_WINDOW_DAYS - 1));
  return clamp01(baseMagnitude * factor);
}

/**
 * The pack's contextWeightAdjustments re-evaluated for scrub offset `day`
 * (0 = the pack's own "now"). TEMPORAL adjustments have their magnitude recomputed
 * as the modeled deadline approaches (`daysUntil = 14 − day`); non-temporal ones
 * pass through byte-identical. Never mutates the input. Deterministic.
 */
export function adjustmentsAt(
  pack: DecisionContextPack,
  day: number,
): ContextWeightAdjustment[] {
  const daysUntil = DECAY_WINDOW_DAYS - day; // deadline at the far edge; advances toward it
  return pack.contextWeightAdjustments.map((adj) => {
    if (!TEMPORAL_CATEGORIES.has(adj.targetCategory)) return adj; // time-invariant → unchanged
    return { ...adj, magnitude: magnitudeAt(daysUntil, adj.magnitude) };
  });
}

/**
 * The smallest day offset (≥0) at which structural integrity first drops below
 * `threshold` when the raw attacks are reweighted by the pack's temporal
 * adjustments AT that day, or null if the structure survives the whole horizon.
 *
 * Pure: `applyAttacks` clones internally, so `baseGraph` is never mutated.
 * Deterministic: fixed ascending scan, no randomness, no wall clock.
 */
export function failsInDays(
  baseGraph: Graph,
  rawAttacks: Attack[],
  pack: DecisionContextPack,
  threshold: number,
  horizon = 30,
): number | null {
  for (let day = 0; day <= horizon; day++) {
    const effective = reweightAttacksByContext(rawAttacks, adjustmentsAt(pack, day));
    const value = integrity(applyAttacks(baseGraph, effective));
    if (value < threshold) return day;
  }
  return null;
}
