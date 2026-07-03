// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import type { Graph } from "./types";
import { integrity } from "./propagation";

export interface Keystone {
  id: string;
  label: string;
  /** Drop in structural integrity (percentage points) if this assumption fails. */
  impact: number;
}

export function cloneGraph(graph: Graph): Graph {
  return {
    thesisId: graph.thesisId,
    nodes: graph.nodes.map((n) => ({
      ...n,
      groups: n.groups.map((g) => ({ kind: g.kind, childIds: [...g.childIds] })),
    })),
  };
}

/** For each assumption, integrity(baseline) - integrity(that assumption knocked to 0). */
export function rankLoadBearing(graph: Graph): Keystone[] {
  const baseline = integrity(graph);
  const results: Keystone[] = [];
  for (const node of graph.nodes) {
    if (node.type !== "assumption") continue;
    const probe = cloneGraph(graph);
    probe.nodes.find((n) => n.id === node.id)!.confidence = 0;
    results.push({ id: node.id, label: node.label, impact: baseline - integrity(probe) });
  }
  return results.sort((a, b) => b.impact - a.impact);
}

export function keystone(graph: Graph): Keystone | null {
  return rankLoadBearing(graph)[0] ?? null;
}
