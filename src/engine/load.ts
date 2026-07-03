// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import type { Attack, Graph } from "./types";
import { clamp01, computeSupport, FAILURE_THRESHOLD } from "./propagation";
import { cloneGraph } from "./sensitivity";

/** Apply adversarial attacks, compounding severity on shared targets. */
export function applyAttacks(graph: Graph, attacks: Attack[]): Graph {
  const out = cloneGraph(graph);
  for (const attack of attacks) {
    const target = out.nodes.find((n) => n.id === attack.targetId);
    if (!target) continue;
    target.confidence = clamp01(target.confidence * (1 - clamp01(attack.severity)));
  }
  return out;
}

/** Nodes whose support has dropped below the failure threshold. */
export function detectFailures(graph: Graph): Set<string> {
  const support = computeSupport(graph);
  const failed = new Set<string>();
  for (const [id, value] of support) {
    if (value < FAILURE_THRESHOLD) failed.add(id);
  }
  return failed;
}
