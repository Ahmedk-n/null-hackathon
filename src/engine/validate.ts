import type { Graph } from "./types";

/**
 * Referential well-formedness checks for a graph. Pure. Used at the LLM
 * boundary (extractStructure) so a malformed model-proposed graph — dangling
 * childIds, a missing thesis, duplicate ids — is rejected and falls back to a
 * fixture instead of silently producing a 0-integrity structure in the engine.
 *
 * The engine itself still degrades unknown children safely (defense in depth);
 * this is the guard that keeps such graphs from reaching it in the first place.
 */
export function graphReferenceIssues(graph: Graph): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) issues.push(`duplicate node id: ${n.id}`);
    ids.add(n.id);
  }
  if (graph.nodes.length === 0) issues.push("graph has no nodes");
  if (!ids.has(graph.thesisId)) issues.push(`thesisId not found: ${graph.thesisId}`);
  for (const n of graph.nodes) {
    for (const g of n.groups) {
      for (const c of g.childIds) {
        if (!ids.has(c)) issues.push(`node ${n.id} references missing child: ${c}`);
      }
    }
  }
  return issues;
}

/** True when every childId and the thesisId resolve to a real, unique node. */
export function isGraphWellFormed(graph: Graph): boolean {
  return graphReferenceIssues(graph).length === 0;
}
