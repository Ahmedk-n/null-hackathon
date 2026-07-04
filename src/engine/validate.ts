import type { Attack, Graph } from "./types";

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

/**
 * Referential check for attacks: every `targetId` must resolve to a node in the
 * graph. Used at the LLM boundary (generateAttacks) so a model that invents a
 * `targetId` falls back to fixture attacks instead of silently no-op'ing.
 * (`applyAttacks` already ignores unknown targets — this is defense in depth.)
 */
export function attacksReferenceIssues(attacks: Attack[], graph: Graph): string[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const issues: string[] = [];
  for (const a of attacks) {
    if (!ids.has(a.targetId)) issues.push(`attack ${a.id} targets missing node: ${a.targetId}`);
  }
  return issues;
}

export interface AttackValidationResult {
  ok: boolean;
  issues: string[];
  /** The subset of attacks that passed every check (useful for partial use). */
  validAttacks: Attack[];
}

/**
 * Full validation of a proposed attack set before deterministic application.
 * Enforces the "LLM proposes, code decides" boundary: an attack must target an
 * existing ASSUMPTION node, have a unique id, a finite severity, and a rationale.
 * Attacks are proposals; this is where code decides whether to trust them.
 */
export function validateAttacks(graph: Graph, attacks: Attack[]): AttackValidationResult {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const issues: string[] = [];
  const validAttacks: Attack[] = [];
  for (const a of attacks) {
    const local: string[] = [];
    const node = byId.get(a.targetId);
    if (!node) local.push(`attack ${a.id} targets missing node: ${a.targetId}`);
    else if (node.type !== "assumption") {
      local.push(`attack ${a.id} targets non-assumption node: ${a.targetId} (${node.type})`);
    }
    if (seen.has(a.id)) local.push(`duplicate attack id: ${a.id}`);
    seen.add(a.id);
    if (!Number.isFinite(a.severity)) local.push(`attack ${a.id} has non-finite severity`);
    if (typeof a.rationale !== "string" || a.rationale.trim() === "") {
      local.push(`attack ${a.id} has empty rationale`);
    }
    if (local.length === 0) validAttacks.push(a);
    else issues.push(...local);
  }
  return { ok: issues.length === 0, issues, validAttacks };
}
