import type { Graph, Keystone } from "./types";
import { integrity } from "./propagation";

export function cloneGraph(graph: Graph): Graph {
  return {
    thesisId: graph.thesisId,
    nodes: graph.nodes.map((n) => ({
      ...n,
      groups: n.groups.map((g) => ({ kind: g.kind, childIds: [...g.childIds] })),
    })),
  };
}

/**
 * Knock-out sensitivity: for each assumption, integrity(baseline) minus
 * integrity(that assumption knocked to confidence 0).
 *
 * Sorted by impact descending. Ties broken by id ascending so the ordering is
 * fully deterministic regardless of node insertion order — i.e. `keystone(g)?.id`
 * is STABLE across reruns (important: Founder B keys UI highlighting off it).
 */
export function rankLoadBearing(graph: Graph): Keystone[] {
  const baseline = integrity(graph);
  const results: Keystone[] = [];
  for (const node of graph.nodes) {
    if (node.type !== "assumption") continue;
    const probe = cloneGraph(graph);
    const target = probe.nodes.find((n) => n.id === node.id);
    if (target) target.confidence = 0;
    results.push({
      id: node.id,
      label: node.label,
      impact: baseline - integrity(probe),
    });
  }
  return results.sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id));
}

/** The single most load-bearing assumption, or null if there are none. */
export function keystone(graph: Graph): Keystone | null {
  return rankLoadBearing(graph)[0] ?? null;
}
