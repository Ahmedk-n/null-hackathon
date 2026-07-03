import type { Attack, Graph } from "./types";
import { clamp01, computeSupport, FAILURE_THRESHOLD } from "./propagation";
import { cloneGraph } from "./sensitivity";

/**
 * Apply adversarial attacks, returning a NEW graph (input never mutated).
 * Each attack multiplies its target's confidence by (1 - severity);
 * multiple attacks on one target compound.
 */
export function applyAttacks(graph: Graph, attacks: Attack[]): Graph {
  const out = cloneGraph(graph);
  for (const attack of attacks) {
    const target = out.nodes.find((n) => n.id === attack.targetId);
    if (!target) continue; // attack on unknown id is a no-op
    target.confidence = clamp01(target.confidence * (1 - clamp01(attack.severity)));
  }
  return out;
}

/**
 * Nodes whose support has dropped below the failure threshold.
 * `threshold` defaults to FAILURE_THRESHOLD.
 */
export function detectFailures(
  graph: Graph,
  threshold: number = FAILURE_THRESHOLD,
): Set<string> {
  const support = computeSupport(graph);
  const failed = new Set<string>();
  for (const [id, value] of support) {
    if (value < threshold) failed.add(id);
  }
  return failed;
}
