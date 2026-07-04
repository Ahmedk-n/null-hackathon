// Validation wall at the LLM boundary. Arbitrary live-LLM graphs/attacks are shape-checked
// upstream (schemas.ts) but can still crash the PURE engine: propagation.topoOrder throws on
// cycles and nodeById throws on dangling refs. This module REPAIRS what it safely can and
// REJECTS (→ null) what it cannot, so nothing malformed ever reaches the engine.
//
// Boundary: llm → engine is allowed, but we import engine TYPES only (never engine internals
// like topoOrder). The acyclicity/reachability checks are self-contained here. normaliseCategory
// is a pure context function (context is pure, no engine dependency the wrong way).
import type { Attack, DepGroup, Graph, GraphNode, NodeEvidence } from "@/engine";
import { normaliseCategory } from "@/context/weights";

/**
 * V7-4 · deep-copy + normalise a node's evidence to the MULTI-CITATION array shape. `null`/
 * `undefined` pass through; a lone `{source,fact}` object (legacy / single-evidence) is coerced
 * to a 1-element array. Each item's optional `stance` is preserved. Engine-inert.
 */
function cloneEvidence(
  e: NodeEvidence | NodeEvidence[] | null,
): NodeEvidence[] | null {
  if (e == null) return e;
  const arr = Array.isArray(e) ? e : [e];
  return arr.map((it) =>
    it.stance == null
      ? { source: it.source, fact: it.fact }
      : { source: it.source, fact: it.fact, stance: it.stance },
  );
}

/** Local, total clamp (NaN → 0). Kept self-contained so validate.ts imports no engine functions. */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

const NODE_MIN = 5;
// V7-1 · widened 12→22 so live graphs can go GENUINELY DEEP (thesis → claims → assumptions →
// sub-assumptions / evidence-support nodes) now that the depth-robust typed-AND aggregation
// (propagation.ts) lets deep honest trees integrate to a meaningful integrity instead of ~0.
// Kept ≤25 so layout stays inside pickLayoutMode's built Band 2 (the >25 clustered band is UNBUILT).
const NODE_MAX = 22;
// V5-3 · manual editing relaxes the node-count band (the LLM path stays 5..12): a human may
// prune a Structure smaller or grow it larger than an LLM proposal. 3 keeps a thesis + a claim
// + one assumption viable; 25 is the top of pickLayoutMode's built bands.
const MANUAL_NODE_MIN = 3;
const MANUAL_NODE_MAX = 25;
const SEVERITY_CAP = 0.6; // raw attacks are capped; context reweighting must be what tips structure.

/** V5-3 · node-count caps only. All other rules (one thesis, acyclic, no orphans) are identical. */
export interface ValidateGraphOptions {
  minNodes?: number;
  maxNodes?: number;
}

/** Deep copy so the input Graph is never mutated. */
function cloneGraph(g: Graph): Graph {
  return {
    thesisId: g.thesisId,
    nodes: g.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      confidence: n.confidence,
      groups: n.groups.map((gr) => ({ kind: gr.kind, childIds: [...gr.childIds] })),
      // Preserve confidence provenance through the repair path (deep-copied; null/undefined
      // pass through untouched). Engine-inert, but the UI needs it to survive validation.
      // V7-4 · evidence is a MULTI-CITATION array now: deep-copy each item (source/fact/stance).
      // BACKWARD-COMPAT: a lone {source,fact} object (legacy / single-evidence live reply that
      // reached here un-coerced) is wrapped into a 1-element array so the frozen single-evidence
      // fixtures and any old single object still pass the wall unchanged.
      ...(n.evidence !== undefined ? { evidence: cloneEvidence(n.evidence) } : {}),
      // V5-3 · preserve human-edit provenance through the manual-edit validation path too.
      ...(n.provenance !== undefined ? { provenance: n.provenance } : {}),
    })),
  };
}

/** Self-contained cycle check (DFS with a recursion stack). Mirrors what engine topoOrder visits. */
function hasCycle(nodes: GraphNode[]): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // 0 = unvisited, 1 = on stack (grey), 2 = done (black)
  const state = new Map<string, 0 | 1 | 2>();

  const visit = (id: string): boolean => {
    const node = byId.get(id);
    if (!node) return false; // dangling refs are removed before this runs
    state.set(id, 1);
    for (const group of node.groups) {
      for (const childId of group.childIds) {
        const s = state.get(childId);
        if (s === 1) return true; // back edge → cycle
        if (s === undefined && visit(childId)) return true;
      }
    }
    state.set(id, 2);
    return false;
  };

  for (const node of nodes) {
    if (state.get(node.id) === undefined && visit(node.id)) return true;
  }
  return false;
}

/** Ids reachable from the thesis by walking dependency groups (child edges). */
function reachableFrom(nodes: GraphNode[], rootId: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    for (const group of node.groups) {
      for (const childId of group.childIds) {
        if (!seen.has(childId)) stack.push(childId);
      }
    }
  }
  return seen;
}

/**
 * Validate + repair a live-LLM graph so the pure engine can never crash on it.
 *
 * Repair-vs-reject policy:
 *  - confidences outside [0,1] (or NaN)  → REPAIR (clamp).
 *  - orphan childIds (ref to unknown id) → REPAIR (drop the childId); groups left empty → REPAIR (drop group).
 *  - thesis: not exactly one thesis node, or thesisId not pointing at it → REJECT (null).
 *  - thesis ends up with no dependency groups → REJECT (null).
 *  - nodes unreachable from the thesis → REPAIR (drop them).
 *  - any cycle → REJECT (null).
 *  - final node count outside 5..12 → REJECT (null).
 *
 * Returns a repaired DEEP COPY, or null when unrepairable. Never mutates the input.
 *
 * V5-3 · `opts` parametrizes the node-count band ONLY (default = LLM path 5..12). Every other
 * rule is identical, so `validateManualEdit` (3..25) and the LLM wall share one implementation.
 */
export function validateGraph(g: Graph, opts: ValidateGraphOptions = {}): Graph | null {
  const minNodes = opts.minNodes ?? NODE_MIN;
  const maxNodes = opts.maxNodes ?? NODE_MAX;
  const graph = cloneGraph(g);

  // Clamp confidences (repair).
  for (const node of graph.nodes) node.confidence = clamp01(node.confidence);

  // Exactly one thesis, and thesisId must point at it.
  const theses = graph.nodes.filter((n) => n.type === "thesis");
  if (theses.length !== 1) return null;
  const thesis = theses[0];
  if (graph.thesisId !== thesis.id) return null;

  // Drop orphan childIds, then drop groups left empty (repair).
  const knownIds = new Set(graph.nodes.map((n) => n.id));
  for (const node of graph.nodes) {
    node.groups = node.groups
      .map((gr): DepGroup => ({ kind: gr.kind, childIds: gr.childIds.filter((c) => knownIds.has(c)) }))
      .filter((gr) => gr.childIds.length > 0);
  }

  // If the thesis lost all its groups, nothing hangs off it → unrepairable.
  if (thesis.groups.length === 0) return null;

  // Drop nodes unreachable from the thesis (repair). Dropped nodes can never be a child of a
  // reachable node (else they'd be reachable), so this introduces no new orphan refs.
  const reachable = reachableFrom(graph.nodes, graph.thesisId);
  graph.nodes = graph.nodes.filter((n) => reachable.has(n.id));

  // Acyclicity on the surviving graph (this is exactly what the engine will topo-sort).
  if (hasCycle(graph.nodes)) return null;

  // Node-count band (checked AFTER dropping unreachable nodes).
  if (graph.nodes.length < minNodes || graph.nodes.length > maxNodes) return null;

  return graph;
}

/**
 * V5-3 · the manual-edit validation wall. Same repair-vs-reject policy as `validateGraph`
 * (one thesis, acyclic, no orphans, thesis keeps ≥1 group) with the node-count band relaxed
 * to 3..25 so a human can prune or grow the Structure past an LLM proposal. The graph-editing
 * store actions run every edit through this before committing; null → reject (surface editError).
 */
export function validateManualEdit(g: Graph): Graph | null {
  return validateGraph(g, { minNodes: MANUAL_NODE_MIN, maxNodes: MANUAL_NODE_MAX });
}

/**
 * Validate + repair live-LLM attacks against an already-validated graph.
 *
 * Repair-vs-reject policy:
 *  - targetId not an assumption node in the graph → REPAIR (drop the attack).
 *  - severity outside [0,1] / NaN               → REPAIR (clamp); then raw capped at ≤0.6.
 *  - more than one attack per targetId          → REPAIR (keep the highest severity).
 *  - nothing survives                           → REJECT (null).
 *  - no surviving attack has a category that normaliseCategory maps to a WeightCategory
 *    (reweighting would be a no-op) → REJECT (null).
 *
 * Returns repaired COPIES (never mutates the input attacks).
 */
export function validateAttacks(graph: Graph, attacks: Attack[]): Attack[] | null {
  const assumptionIds = new Set(
    graph.nodes.filter((n) => n.type === "assumption").map((n) => n.id),
  );

  // Drop attacks that don't target an assumption; clamp+cap severity on the survivors (copies).
  const cleaned = attacks
    .filter((a) => assumptionIds.has(a.targetId))
    .map((a) => ({ ...a, severity: Math.min(SEVERITY_CAP, clamp01(a.severity)) }));

  // At most one attack per target — keep the strongest.
  const strongestByTarget = new Map<string, Attack>();
  for (const a of cleaned) {
    const existing = strongestByTarget.get(a.targetId);
    if (!existing || a.severity > existing.severity) strongestByTarget.set(a.targetId, a);
  }
  const result = [...strongestByTarget.values()];

  if (result.length === 0) return null;

  // At least one category must be reweightable, else applying context is a no-op.
  const anyNormalisable = result.some((a) => normaliseCategory(a.category) !== null);
  if (!anyNormalisable) return null;

  return result;
}
