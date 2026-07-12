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

/** One concrete, cheap falsifying test that de-risks a specific council finding. */
export interface Remediation {
  /** The finding this de-risks: the context-keystone nodeId (kind "spine") OR a hidden
   *  assumption's `label` (kind "hidden"). Joins back to the surviving finding in the critic. */
  findingId: string;
  kind: "spine" | "hidden";
  /** One concrete, cheap experiment/evidence that would falsify the finding before committing. */
  action: string;
  /** Grounds the remediation; checked against findingKeys by the critic. */
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
  /** One de-risking action per surviving finding (spine + hidden). Overlay only — never
   *  consumed by the engine or the attack path. Grounded/filtered by the critic. */
  remediations: Remediation[];
  source: "live" | "fixture";
  /** Truthful source of `remediations` ALONE — independent of `source` so a failed action
   *  call cannot demote the diagnosis or block the live contextual attacks from the engine. */
  remediationSource: "live" | "fixture";
}
