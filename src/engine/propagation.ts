import type { Graph, GraphNode } from "./types";

/** Default support below which a node is considered failed. */
export const FAILURE_THRESHOLD = 0.35;

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** O(1) id -> node lookup for a graph. */
function nodeMap(graph: Graph): Map<string, GraphNode> {
  const map = new Map<string, GraphNode>();
  for (const node of graph.nodes) map.set(node.id, node);
  return map;
}

export function nodeById(graph: Graph, id: string): GraphNode {
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node not found: ${id}`);
  return n;
}

/**
 * Topological order with children strictly before their parents.
 * - Throws a clear error on a cycle.
 * - Unknown child ids are skipped safely (they contribute 0 support downstream).
 */
export function topoOrder(graph: Graph): string[] {
  const map = nodeMap(graph);
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (id: string, stack: Set<string>) => {
    if (visited.has(id)) return;
    if (stack.has(id)) throw new Error(`cycle detected at ${id}`);
    const node = map.get(id);
    if (!node) return; // unknown child id — skip; treated as 0 support later
    stack.add(id);
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

/**
 * Support of every node, computed bottom-up.
 * - leaf (no groups): support = clamp01(confidence)
 * - AND group aggregate = product of member supports
 * - OR group aggregate = max of member supports
 * - multiple groups on one node combine by product
 * - unknown child id contributes support 0
 */
export function computeSupport(graph: Graph): Map<string, number> {
  const map = nodeMap(graph);
  const support = new Map<string, number>();
  for (const id of topoOrder(graph)) {
    const node = map.get(id);
    if (!node) continue;
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
