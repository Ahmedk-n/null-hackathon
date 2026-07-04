// Harvested from origin/founder-a/context-core (src/engine/explain.ts), adapted to OUR engine.
// Pure, deterministic explainability helpers. These expose the engine's reasoning as DATA
// (never prose the LLM wrote) so the UI can render "why" panels and the pitch can claim
// "code decides, and can show its work". No LLM/context/UI imports — engine purity preserved
// (guarded by boundary.test.ts).
//
// ADAPTATION: our GraphNode carries optional `evidence` (confidence provenance, V3-6) and
// `provenance: "modified"` (human-edit flag, V5-3). Both are engine-inert. supportBreakdown
// passes them through UNTOUCHED so the UI keeps the plate/flags on the decomposed node.
import type { Attack, GroupKind, Graph, NodeType, NodeEvidence } from "./types";
import { aggregateGroup, clamp01, computeSupport, FAILURE_THRESHOLD, integrity } from "./propagation";
import { applyAttacks } from "./load";
import { keystone, rankLoadBearing } from "./sensitivity";

/* ---------------- supportBreakdown ---------------- */

export interface GroupContribution {
  kind: GroupKind;
  childIds: string[];
  /**
   * Aggregate of this group under the depth-robust rule (V7-1): OR = max; AND =
   * geometric mean when every child is a leaf assumption (corroborating premises),
   * product when a child is an internal sub-goal, passthrough for a single child.
   */
  value: number;
}

export interface NodeSupport {
  id: string;
  type: NodeType;
  label: string;
  ownConfidence: number;
  groups: GroupContribution[];
  /** Product of all group values (1 for a leaf). */
  dependencyFactor: number;
  support: number;
  failed: boolean;
  /** Passed through from the source node, engine-inert (see file header). V7-4 · multi-citation array. */
  evidence?: NodeEvidence[] | null;
  /** Passed through from the source node, engine-inert (see file header). */
  provenance?: "modified";
}

export interface SupportBreakdown {
  thesisId: string;
  threshold: number;
  integrity: number;
  nodes: NodeSupport[];
}

/** Per-node support decomposition (own confidence × dependency factor). */
export function supportBreakdown(
  graph: Graph,
  threshold: number = FAILURE_THRESHOLD,
): SupportBreakdown {
  const support = computeSupport(graph);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes: NodeSupport[] = graph.nodes.map((n) => {
    const ownConfidence = clamp01(n.confidence);
    const groups: GroupContribution[] = n.groups.map((g) => {
      const members = g.childIds.map((c) => support.get(c) ?? 0);
      const allChildrenLeaf = g.childIds.every(
        (c) => (byId.get(c)?.groups.length ?? 0) === 0,
      );
      const value = aggregateGroup(g.kind, members, allChildrenLeaf);
      return { kind: g.kind, childIds: [...g.childIds], value };
    });
    const dependencyFactor = groups.reduce((acc, g) => acc * g.value, 1);
    const nodeSupport = support.get(n.id) ?? 0;
    return {
      id: n.id,
      type: n.type,
      label: n.label,
      ownConfidence,
      groups,
      dependencyFactor,
      support: nodeSupport,
      failed: nodeSupport < threshold,
      // Passed through untouched (engine never reads these; UI does).
      evidence: n.evidence,
      provenance: n.provenance,
    };
  });
  return {
    thesisId: graph.thesisId,
    threshold,
    integrity: integrity(graph),
    nodes,
  };
}

/* ---------------- explainKeystone ---------------- */

export interface RankedAssumption {
  id: string;
  label: string;
  impact: number;
}

export interface KeystoneExplanation {
  baselineIntegrity: number;
  keystoneId: string | null;
  keystoneLabel: string | null;
  keystoneImpact: number;
  /** Impact of the second-highest assumption (0 if fewer than two). */
  nextImpact: number;
  /** keystoneImpact / nextImpact; Infinity if next is 0, 0 if no keystone. */
  impactRatio: number;
  ranked: RankedAssumption[];
  /** Deterministic, number-derived sentence (NOT model prose). */
  explanation: string;
}

/** Explain, deterministically, why the keystone is load-bearing. */
export function explainKeystone(graph: Graph): KeystoneExplanation {
  const baseline = integrity(graph);
  const ranked = rankLoadBearing(graph).map((r) => ({ id: r.id, label: r.label, impact: r.impact }));
  const key = keystone(graph);
  const keystoneImpact = key?.impact ?? 0;
  const nextImpact = ranked[1]?.impact ?? 0;
  const impactRatio = key ? (nextImpact === 0 ? Infinity : keystoneImpact / nextImpact) : 0;
  const pctOfBaseline = baseline > 0 ? (keystoneImpact / baseline) * 100 : 0;
  const explanation = key
    ? `Knocking out "${key.label}" drops structural integrity by ${keystoneImpact.toFixed(1)} points ` +
      `(${pctOfBaseline.toFixed(0)}% of the ${baseline.toFixed(1)} baseline)` +
      (nextImpact > 0
        ? `, ${(keystoneImpact / nextImpact).toFixed(1)}x more than the next assumption.`
        : `, while no other assumption is load-bearing.`)
    : "This decision has no assumptions to stress-test.";
  return {
    baselineIntegrity: baseline,
    keystoneId: key?.id ?? null,
    keystoneLabel: key?.label ?? null,
    keystoneImpact,
    nextImpact,
    impactRatio,
    ranked,
    explanation,
  };
}

/* ---------------- summariseLoadResult ---------------- */

export interface LoadResultSummary {
  baselineIntegrity: number;
  postLoadIntegrity: number;
  integrityDrop: number;
  failedNodeIds: string[];
  holdingNodeIds: string[];
  keystoneBeforeLoad: string | null;
  keystoneAfterLoad: string | null;
  attacksApplied: number;
  threshold: number;
}

/** Clean data contract for the collapse panel: before/after a load is applied. */
export function summariseLoadResult(
  graph: Graph,
  attacks: Attack[],
  threshold: number = FAILURE_THRESHOLD,
): LoadResultSummary {
  const baseline = integrity(graph);
  const loaded = applyAttacks(graph, attacks);
  const support = computeSupport(loaded);
  const failed: string[] = [];
  const holding: string[] = [];
  for (const n of loaded.nodes) {
    ((support.get(n.id) ?? 0) < threshold ? failed : holding).push(n.id);
  }
  failed.sort();
  holding.sort();
  return {
    baselineIntegrity: baseline,
    postLoadIntegrity: integrity(loaded),
    integrityDrop: baseline - integrity(loaded),
    failedNodeIds: failed,
    holdingNodeIds: holding,
    keystoneBeforeLoad: keystone(graph)?.id ?? null,
    keystoneAfterLoad: keystone(loaded)?.id ?? null,
    attacksApplied: attacks.length,
    threshold,
  };
}
