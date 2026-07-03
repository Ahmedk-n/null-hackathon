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
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  /** How solid this node is on its own, 0..1. */
  confidence: number;
  /** Dependency groups. Empty for leaf assumptions. */
  groups: DepGroup[];
  /** Optional confidence provenance. Engine-inert; UI-only. null = ungrounded assumption. */
  evidence?: NodeEvidence | null;
  /**
   * V5-3 · human-edit provenance. OPTIONAL, purely additive, ENGINE-INERT (like `evidence`):
   * the pure engine never reads it. `"modified"` marks a node a human edited via the studio
   * inspector (rename / add-assumption / group-kind flip) → the UI renders it
   * MODIFIED — UNVERIFIED and detaches any evidence plate (the cited fact no longer backs the
   * edited belief). Undefined means untouched (LLM- or fixture-authored).
   */
  provenance?: "modified";
}

export interface Graph {
  nodes: GraphNode[];
  thesisId: string;
}

export interface Attack {
  id: string;
  targetId: string;
  category: string;
  /** How much this attack undermines its target, 0..1. */
  severity: number;
  rationale: string;
}
