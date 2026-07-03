import type { Graph, NodeType } from "@/engine";

/**
 * V4-1 · Z = REASONING DEPTH. The Z-axis ENCODES how deep the analysis goes — it is
 * not a decorative tilt. Reasoning descends through legible strata: the thesis rides
 * highest, claims sit beneath it, assumptions lower still, and the EVIDENCE that
 * grounds those assumptions forms the lowest stratum (the ground truth). This module
 * is pure (data-in / data-out, no React, no wall-clock, no randomness) so the depth
 * contract is unit-testable and safe to bundle anywhere.
 */

/** Stratum level per structural role — L0 thesis (top) → L2 assumptions. */
export const STRATUM_LEVEL: Record<NodeType, 0 | 1 | 2> = {
  thesis: 0,
  claim: 1,
  assumption: 2,
};

/** The evidence stratum (L3) is the fourth, deepest level — below the assumptions. */
export const EVIDENCE_LEVEL = 3 as const;

/** Resting Z elevation (px) per structural role in SECTION view. Thesis highest. */
export const LAYER_Z: Record<NodeType, number> = {
  thesis: 84,
  claim: 48,
  assumption: 12,
};

/** Elevation of the evidence stratum — below the assumptions it grounds. */
export const EVIDENCE_Z = -30;

/** Extra Z bump for the keystone so it reads as the load-bearing apex of its stratum. */
export const KEYSTONE_Z_BUMP = 18;

export interface StratumMeta {
  level: 0 | 1 | 2 | 3;
  key: NodeType | "evidence";
  label: string;
  /** Resting elevation in px along Z (SECTION view). */
  z: number;
}

/** The four reasoning strata, ordered top → bottom (thesis → evidence). */
export const STRATA: readonly StratumMeta[] = [
  { level: 0, key: "thesis", label: "L0 THESIS", z: LAYER_Z.thesis },
  { level: 1, key: "claim", label: "L1 CLAIMS", z: LAYER_Z.claim },
  { level: 2, key: "assumption", label: "L2 ASSUMPTIONS", z: LAYER_Z.assumption },
  { level: 3, key: "evidence", label: "L3 EVIDENCE", z: EVIDENCE_Z },
];

export interface AnalysisDepth {
  /** Distinct reasoning strata present, including evidence (0..4). */
  strata: number;
  /** Assumptions with attached evidence (grounded beliefs). */
  grounded: number;
  /** Total assumption nodes (the load-bearing beliefs). */
  assumptions: number;
}

/**
 * DEPTH metric — the dimensionality of the analysis, computed from the graph shape.
 * `strata` counts the distinct structural layers present (thesis/claims/assumptions)
 * plus the evidence stratum whenever at least one node carries evidence. `grounded` /
 * `assumptions` is the evidence coverage: how many load-bearing beliefs actually cite
 * a source vs. how many float unsupported. A judge reads "reasoned 4 strata deep,
 * 4/5 assumptions grounded."
 */
export function analysisDepth(graph: Graph): AnalysisDepth {
  const typesPresent = new Set<NodeType>();
  let grounded = 0;
  let assumptions = 0;
  let hasEvidence = false;
  for (const n of graph.nodes) {
    typesPresent.add(n.type);
    if (n.type === "assumption") {
      assumptions += 1;
      if (n.evidence != null) grounded += 1;
    }
    if (n.evidence != null) hasEvidence = true;
  }
  const strata = typesPresent.size + (hasEvidence ? 1 : 0);
  return { strata, grounded, assumptions };
}

/**
 * The strata actually present in a graph, top → bottom — drives the canvas stratum
 * chrome (plane rules + L0..L3 labels). Evidence is present only when a node carries
 * it; a graph with no evidence renders three strata, not four.
 */
export function presentStrata(graph: Graph): StratumMeta[] {
  const types = new Set(graph.nodes.map((n) => n.type));
  const hasEvidence = graph.nodes.some((n) => n.evidence != null);
  return STRATA.filter((s) =>
    s.key === "evidence" ? hasEvidence : types.has(s.key as NodeType),
  );
}
