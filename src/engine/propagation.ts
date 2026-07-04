// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import type { Graph, GraphNode, GroupKind } from "./types";

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

/* ────────────────────────────────────────────────────────────────────────────
 * DEPTH-ROBUST AGGREGATION (V7-1)
 * ────────────────────────────────────────────────────────────────────────────
 * The old rule was product-AND: a group's value = Π(child supports). Because theses
 * and claims are pinned to confidence 1.0, that made every honest tree deeper than
 * 3 layers integrate to ~0 (a 3-way claim of 0.8 assumptions = 0.51; nest that under
 * a 3-claim thesis = 0.13; add one more layer → single digits) — so every graph was
 * forced shallow by DECREE, not capability.
 *
 * The fix is a TYPE-AWARE AND rule that separates the two kinds of conjunction a
 * decision tree actually contains:
 *
 *   • A claim resting on several INDEPENDENT leaf assumptions / evidence-support nodes
 *     ("all children are leaves") is corroborated reasoning: adding more honest
 *     premises must NOT mechanically crater the claim. These aggregate by the
 *     GEOMETRIC MEAN — scale-free in the number of children, so breadth/depth of
 *     honest support keeps the claim MEANINGFUL (a 4-assumption claim of 0.8s stays
 *     0.8, not 0.41). This is the depth-robustness.
 *
 *   • A node resting on genuine SUB-GOALS (children that are themselves internal
 *     claims / decomposed assumptions) is a conjunction of things that must EACH hold.
 *     These aggregate by the PRODUCT — so one cratering sub-goal craters the parent.
 *     This is what preserves the keystone/collapse dynamics: the thesis is a product
 *     of its claims, so knocking (or grounding-down) the load-bearing claim still
 *     craters structural integrity to single digits.
 *
 *   • A single-child AND is passthrough (product and geometric mean agree), and any
 *     ZEROED child sends its group to 0 under BOTH branches (geomean of a 0 is 0), so
 *     knock-out sensitivity is unchanged: the keystone still collapses the thesis.
 *
 *   • OR is unchanged: max(children) — alternatives still protect.
 *
 * Deterministic and pure (no new imports; only arithmetic). support(n) =
 *   clamp01( confidence(n) × Π_groups aggregate(group) ).
 */

/** Geometric mean of member supports; 1 for the empty set; 0 if any member is 0. */
function geometricMean(values: number[]): number {
  if (values.length === 0) return 1;
  const product = values.reduce((acc, v) => acc * v, 1);
  return Math.pow(product, 1 / values.length);
}

/**
 * Aggregate one dependency group's member supports into a single 0..1 value.
 * `allChildrenLeaf` selects the AND regime (geometric mean vs product); it has no
 * effect on OR or on single-child groups. Exported so explainability (supportBreakdown)
 * decomposes groups with the EXACT rule the propagation uses — one source of truth.
 */
export function aggregateGroup(
  kind: GroupKind,
  memberSupports: number[],
  allChildrenLeaf: boolean,
): number {
  if (kind === "OR") return memberSupports.reduce((acc, m) => Math.max(acc, m), 0);
  // AND
  if (memberSupports.length <= 1) return memberSupports[0] ?? 1;
  return allChildrenLeaf
    ? geometricMean(memberSupports)
    : memberSupports.reduce((acc, m) => acc * m, 1);
}

/** Support of every node, computed bottom-up. */
export function computeSupport(graph: Graph): Map<string, number> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
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
      const allChildrenLeaf = group.childIds.every(
        (c) => (byId.get(c)?.groups.length ?? 0) === 0,
      );
      aggregate *= aggregateGroup(group.kind, members, allChildrenLeaf);
    }
    support.set(id, clamp01(conf * aggregate));
  }
  return support;
}

/** Structural integrity: thesis support as a 0..100 percentage. */
export function integrity(graph: Graph): number {
  return (computeSupport(graph).get(graph.thesisId) ?? 0) * 100;
}
