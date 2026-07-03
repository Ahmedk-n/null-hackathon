// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
// V3-2 · MINIMUM-REINFORCEMENT SOLVER — the inverse of knock-out sensitivity.
// Knock-out asks "which assumption, if it fails, takes everything down?"; this asks
// "which is the CHEAPEST set of assumptions to prove so the decision survives?".
//
// Pure engine: depends ONLY on ./types ./propagation ./sensitivity (no ./load, no
// context/llm/react/store). `applyAttacks` lives in ./load, so its one-line effect
// (conf *= 1 − severity, compounding, clamped) is re-implemented locally to keep this
// solver's dependency surface minimal. Fully deterministic: fixed ordering, no randomness.
import type { Attack, Graph } from "./types";
import { clamp01, integrity } from "./propagation";
import { cloneGraph, rankLoadBearing } from "./sensitivity";

export interface ReinforcementPlan {
  /** Smallest set of assumption ids to restore (in load-bearing order). */
  targetIds: string[];
  /** Attacked integrity, 0..100. */
  integrityBefore: number;
  /** Integrity with the set restored (or the best achievable ceiling if unreachable). */
  integrityAfter: number;
  /** false if restoring ALL assumptions still can't cross the threshold. */
  reachable: boolean;
}

// Local mirror of load.applyAttacks — kept here so the solver imports only
// types/propagation/sensitivity. conf *= (1 − severity), compounding on shared
// targets, clamped to [0,1]; the input graph is never mutated.
function attackedGraph(base: Graph, attacks: Attack[]): Graph {
  const out = cloneGraph(base);
  for (const atk of attacks) {
    const target = out.nodes.find((n) => n.id === atk.targetId);
    if (!target) continue;
    target.confidence = clamp01(target.confidence * (1 - clamp01(atk.severity)));
  }
  return out;
}

// Clone the attacked graph and restore each `ids` member's confidence to its BASE value.
function withRestored(attacked: Graph, base: Graph, ids: Set<string>): Graph {
  const clone = cloneGraph(attacked);
  for (const node of clone.nodes) {
    if (!ids.has(node.id)) continue;
    const baseNode = base.nodes.find((n) => n.id === node.id);
    if (baseNode) node.confidence = baseNode.confidence;
  }
  return clone;
}

// Combinations of `size` items, generated in the input array's own order (lexicographic
// by index). Because the candidate array is pre-sorted by load-bearing rank, the first
// combination yielded in each size tier is the most load-bearing one — that is the
// narrative tie-break ("prove the crux first").
function* combinations<T>(items: T[], size: number): Generator<T[]> {
  const n = items.length;
  if (size > n || size < 0) return;
  if (size === 0) {
    yield [];
    return;
  }
  const idx = Array.from({ length: size }, (_, i) => i);
  while (true) {
    yield idx.map((i) => items[i]);
    let i = size - 1;
    while (i >= 0 && idx[i] === i + n - size) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
  }
}

// Fallback for pathological graphs (>16 assumptions → >65k subsets). Greedy add-by-
// load-bearing: still deterministic, but NO LONGER guaranteed minimal. The exhaustive
// path above handles every real graph here (n ≤ ~10 → ≤1024 subsets, instant).
function greedyReinforcement(
  attacked: Graph,
  base: Graph,
  ordered: string[],
  threshold: number,
  integrityBefore: number,
  integrityCeiling: number,
): ReinforcementPlan {
  const chosen: string[] = [];
  for (const id of ordered) {
    chosen.push(id);
    const after = integrity(withRestored(attacked, base, new Set(chosen)));
    if (after >= threshold) {
      return { targetIds: chosen, integrityBefore, integrityAfter: after, reachable: true };
    }
  }
  return { targetIds: ordered, integrityBefore, integrityAfter: integrityCeiling, reachable: true };
}

/**
 * The cheapest set of assumptions to restore (prove) so structural integrity crosses
 * `threshold` (0..100). Enumerates subsets of the assumption candidates by ASCENDING
 * cardinality; within a tier, candidates are ordered by `rankLoadBearing` on the base
 * graph so equal-size solutions favor the load-bearing nodes. First subset to cross
 * wins → guaranteed minimal in size. Deterministic (stable ordering, no randomness).
 *
 * Edge cases:
 *  - already ≥ threshold → empty set, reachable true (nothing to prove).
 *  - restoring EVERY assumption still can't cross → empty set, reachable false, with
 *    `integrityAfter` = the best achievable ceiling.
 */
export function minimalReinforcement(
  baseGraph: Graph,
  attacks: Attack[],
  threshold: number,
): ReinforcementPlan {
  const attacked = attackedGraph(baseGraph, attacks);
  const integrityBefore = integrity(attacked);

  // Already surviving — no reinforcement needed.
  if (integrityBefore >= threshold) {
    return { targetIds: [], integrityBefore, integrityAfter: integrityBefore, reachable: true };
  }

  // Candidates = every assumption, ordered by structural load-bearing rank (descending
  // impact) on the HEALTHY base graph — the keystone leads, matching the sensitivity view.
  const candidates = rankLoadBearing(baseGraph).map((k) => k.id);

  // Ceiling: restoring ALL candidates. If even that can't cross the line, no subset can.
  const integrityCeiling = integrity(withRestored(attacked, baseGraph, new Set(candidates)));
  if (integrityCeiling < threshold) {
    return { targetIds: [], integrityBefore, integrityAfter: integrityCeiling, reachable: false };
  }

  // Guard against combinatorial blow-up (never hit by the real graphs here).
  if (candidates.length > 16) {
    return greedyReinforcement(attacked, baseGraph, candidates, threshold, integrityBefore, integrityCeiling);
  }

  for (let size = 1; size <= candidates.length; size++) {
    for (const subset of combinations(candidates, size)) {
      const after = integrity(withRestored(attacked, baseGraph, new Set(subset)));
      if (after >= threshold) {
        return { targetIds: subset, integrityBefore, integrityAfter: after, reachable: true };
      }
    }
  }

  // Unreachable in practice: the full candidate set is itself a subset at the last tier
  // and its integrity equals the ceiling (≥ threshold), so a solution is always found
  // above. Kept as a total-function safety net.
  return { targetIds: candidates, integrityBefore, integrityAfter: integrityCeiling, reachable: true };
}
