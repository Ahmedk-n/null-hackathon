// V7-3 · FAILURE CASCADE — ordered "what breaks first and why".
//
// The store's `failures` is an unordered Set — the STRESS readout can say WHAT failed but
// not the ORDER a reader should reason about it in. This orders the failed nodes by their
// post-load support (lowest first — the node with the least remaining support is the one
// that gives way first), with dependency order (children strictly before parents) as a
// stable tiebreak so equal-support failures read leaf → claim → thesis. Presentational
// only: it re-derives support with the SAME threshold semantics as `detectFailures`
// (support < threshold) but NEVER changes the store or the engine's failure set.
//
// Pure engine: imports only ./types ./propagation ./load (mirrors load.ts). No
// context/llm/react/store. Deterministic — fixed sort keys, no randomness/wall-clock.
// The input graph is never mutated (applyAttacks clones).
import type { Attack, Graph, NodeType } from "./types";
import { FAILURE_THRESHOLD, computeSupport, topoOrder } from "./propagation";
import { applyAttacks } from "./load";

export interface CascadeStep {
  id: string;
  label: string;
  type: NodeType;
  /** Post-load support, 0..1. */
  support: number;
}

/**
 * The failed nodes of `baseGraph` under `attacks`, ordered lowest-support-first (dependency
 * order as tiebreak). `threshold` is on the 0..1 support scale (default = the failure line),
 * matching `detectFailures`. The returned set of ids equals `detectFailures(applyAttacks(...))`;
 * only the ORDER is added.
 */
export function failureCascade(
  baseGraph: Graph,
  attacks: Attack[],
  threshold: number = FAILURE_THRESHOLD,
): CascadeStep[] {
  const loaded = applyAttacks(baseGraph, attacks);
  const support = computeSupport(loaded);
  // Dependency order: children strictly before parents → a deterministic tiebreak that
  // reads as "the leaf gives way, then the claim resting on it, then the thesis".
  const order = topoOrder(loaded);
  const rank = new Map(order.map((id, i) => [id, i]));
  const failed = loaded.nodes
    .filter((n) => (support.get(n.id) ?? 0) < threshold)
    .map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      support: support.get(n.id) ?? 0,
    }));
  failed.sort((a, b) => a.support - b.support || rank.get(a.id)! - rank.get(b.id)!);
  return failed;
}
