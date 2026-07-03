// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import type { Graph, GraphNode } from "./types";

export const FAILURE_THRESHOLD = 0.35;

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function nodeById(graph: Graph, id: string): GraphNode {
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node not found: ${id}`);
  return n;
}

/** Topological order with children strictly before their parents. */
export function topoOrder(graph: Graph): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (id: string, stack: Set<string>) => {
    if (visited.has(id)) return;
    if (stack.has(id)) throw new Error(`cycle detected at ${id}`);
    stack.add(id);
    const node = nodeById(graph, id);
    for (const group of node.groups) {
      for (const childId of group.childIds) visit(childId, stack);
    }
    stack.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const node of graph.nodes) visit(node.id, new Set());
  return order;
}

/** Support of every node, computed bottom-up. */
export function computeSupport(graph: Graph): Map<string, number> {
  const support = new Map<string, number>();
  for (const id of topoOrder(graph)) {
    const node = nodeById(graph, id);
    const conf = clamp01(node.confidence);
    if (node.groups.length === 0) {
      support.set(id, conf);
      continue;
    }
    let aggregate = 1;
    for (const group of node.groups) {
      const members = group.childIds.map((c) => support.get(c) ?? 0);
      const groupValue =
        group.kind === "AND"
          ? members.reduce((acc, m) => acc * m, 1)
          : members.reduce((acc, m) => Math.max(acc, m), 0);
      aggregate *= groupValue;
    }
    support.set(id, clamp01(conf * aggregate));
  }
  return support;
}

/** Structural integrity: thesis support as a 0..100 percentage. */
export function integrity(graph: Graph): number {
  return (computeSupport(graph).get(graph.thesisId) ?? 0) * 100;
}
