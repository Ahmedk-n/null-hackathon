/**
 * Keystone engine — core graph types.
 *
 * PURE MODULE. This file (and everything in src/engine/**) must never import
 * from @/context, @/llm, @/ui, @/canvas, react, next, zustand, or
 * @anthropic-ai/sdk. Enforced by src/engine/boundary.test.ts.
 */

export type NodeType = "assumption" | "claim" | "thesis";

/** Base-plan name is `GroupKind`; `DepGroupKind` is provided as an alias. */
export type GroupKind = "AND" | "OR";
export type DepGroupKind = GroupKind;

export interface DepGroup {
  kind: GroupKind;
  /** Ids of the child (supporting) nodes in this group. */
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
  /** Free-form load category (e.g. "execution risk"). NOT an enum by design. */
  category: string;
  /** How much this attack undermines its target, 0..1. */
  severity: number;
  rationale: string;
}

/**
 * A load-bearing assumption ranked by knock-out impact.
 * Base-plan shape is `{ id, label, impact }` — this is the canonical shape
 * (NOT `{ assumptionId, impact }`). `id` is the assumption's node id.
 */
export interface Keystone {
  id: string;
  label: string;
  /** Drop in structural integrity (percentage points) if this assumption fails. */
  impact: number;
}
