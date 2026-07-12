// Contextual analysis council — shared types (Phase 3, Task 1).
import type { Attack } from "@/engine";

/** How much situational context should weight a given graph node, with rationale. */
export interface NodeWeighting {
  nodeId: string;
  contextWeight: number;
  rationale: string;
  evidenceRefs: string[];
}

/** A load-bearing belief the thesis quietly depends on but never states. */
export interface HiddenAssumption {
  label: string;
  why: string;
  evidenceRefs: string[];
}

/**
 * Output of the contextual analysis council: a situation-aware read on which node is
 * truly load-bearing (which may differ from the graph's topological keystone), plus
 * situation-specific attacks, hidden assumptions, and a one-line fracture narrative.
 */
export interface CouncilResult {
  nodeWeights: NodeWeighting[];
  /** Load-bearing GIVEN context; may differ from the topological keystone. */
  contextKeystoneId: string | null;
  /** Situation-specific attacks, severity in [0.15, 0.55]. */
  contextualAttacks: Attack[];
  hiddenAssumptions: HiddenAssumption[];
  fractureNarrative: string;
  grounded: boolean;
  source: "live" | "fixture";
}
