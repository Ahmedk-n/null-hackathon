// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
export type NodeType = "thesis" | "claim" | "assumption";
export type GroupKind = "AND" | "OR";

export interface DepGroup {
  kind: GroupKind;
  childIds: string[];
}

/**
 * Confidence provenance (V3-6). OPTIONAL, purely additive, ENGINE-INERT: the pure engine
 * never reads `evidence` — it exists so the UI can trace an assumption's confidence to the
 * single most relevant gathered fact (source = file path / url / "notes"). `null` means the
 * assumption is ungrounded (no relevant finding). Undefined means unknown/not extracted.
 */
export interface NodeEvidence {
  /** Provenance, verbatim from the finding: a file path, a url, or "notes". */
  source: string;
  /** The cited fact text supporting (or contradicting) the assumption. */
  fact: string;
  /**
   * V7-4 · which way this citation cuts. "supports" (default) corroborates the assumption;
   * "contradicts" is a real finding that argues AGAINST it (surfaced so the ~12 discarded
   * conflicting findings are visible, not silently dropped). Engine-inert like the rest of
   * evidence — the pure solver never reads it; the UI renders a contradicting plate in --warn/--bad.
   */
  stance?: "supports" | "contradicts";
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  /** How solid this node is on its own, 0..1. */
  confidence: number;
  /** Dependency groups. Empty for leaf assumptions. */
  groups: DepGroup[];
  /**
   * Optional confidence provenance. Engine-inert; UI-only. null = ungrounded assumption.
   * V7-4 · an ARRAY of citations (1-3): supporting findings, plus optionally a contradicting
   * one where gathered findings conflict — so the ~12 discarded findings surface instead of
   * one-per-node. The engine NEVER reads this; it stays a pure display annotation. A single
   * live/legacy `{source,fact}` object is coerced to a 1-element array at the validation wall
   * (validate.ts) for backward-compat with the frozen fixtures and any single-evidence reply.
   */
  evidence?: NodeEvidence[] | null;
  /**
   * V5-3 · human-edit provenance. OPTIONAL, purely additive, ENGINE-INERT (like `evidence`):
   * the pure engine never reads it. `"modified"` marks a node a human edited via the studio
   * inspector (rename / add-assumption / group-kind flip) → the UI renders it
   * MODIFIED — UNVERIFIED and detaches any evidence plate (the cited fact no longer backs the
   * edited belief). Undefined means untouched (LLM- or fixture-authored).
   */
  provenance?: "modified";
  /**
   * PROBABILISTIC · assumption-only evidence strength → Monte-Carlo sampling spread. Engine-inert.
   * Undefined defaults to "moderate" in the solver.
   */
  evidenceStrength?: EvidenceStrength;
}

export interface Graph {
  nodes: GraphNode[];
  thesisId: string;
  /** PROBABILISTIC · latent common-mode drivers. Engine-inert; consumed only by probabilistic.ts. */
  drivers?: Driver[];
}

export interface Attack {
  id: string;
  targetId: string;
  category: string;
  /** How much this attack undermines its target, 0..1. */
  severity: number;
  rationale: string;
}

/**
 * PROBABILISTIC MODEL additions (2026-07). All OPTIONAL, purely additive, ENGINE-INERT:
 * the pure solver (propagation/sensitivity/load/cascade) NEVER reads these. They feed the
 * separate Monte-Carlo brain in `probabilistic.ts`. Kept engine-inert exactly like `evidence`.
 */

/** How solid an assumption's cited evidence is → maps to sampling spread. Assumptions only. */
export type EvidenceStrength = "weak" | "moderate" | "strong";

/**
 * A latent common-mode factor several assumptions share (a vendor, an adoption bet, a rate
 * environment). `loading ∈ [0,1]` is the magnitude of an assumption's dependence on it; a driver
 * "failing" pushes every loaded assumption's confidence DOWN together. This is the correlation
 * structure the naive independent product ignores.
 */
export interface Driver {
  id: string;
  label: string;
  loadings: { assumptionId: string; loading: number }[];
}

/** Output of the Monte-Carlo brain. Integrity as a distribution, not a point. */
export interface ProbabilisticResult {
  pHold: number;                 // fraction of samples with thesis support >= FAILURE_THRESHOLD
  mean: number;                  // mean integrity, 0..100
  band: [number, number];        // [p05, p95] of integrity
  samples: number;               // N used
  keystoneDrivers: { id: string; label: string; sensitivity: number }[];   // Sobol first-order, desc
  keystoneAssumptions: { id: string; influence: number }[];                // squared corr(y, c_i), desc
  clusters: { driverId: string; label: string; assumptionIds: string[]; variance: number; loadBearing: number }[];
  coFailure: { driverId: string; label: string; assumptionIds: string[] }[]; // who falls together on a low-driver shock
}
