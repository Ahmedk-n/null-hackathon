// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
export type NodeType = "thesis" | "claim" | "assumption";
export type GroupKind = "AND" | "OR";

export interface DepGroup {
  kind: GroupKind;
  childIds: string[];
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  /** How solid this node is on its own, 0..1. */
  confidence: number;
  /** Dependency groups. Empty for leaf assumptions. */
  groups: DepGroup[];
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
