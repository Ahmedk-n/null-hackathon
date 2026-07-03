// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import type { Attack, Graph } from "@/engine";

export const FIXTURE_DECISION =
  "We should migrate our monolith to microservices to fix our scaling problems.";

/** Hero-demo graph. Keystone (a_arch) feeds two claims, so knocking it out is fatal. */
export function fixtureGraph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "Migrate to microservices", confidence: 1, groups: [{ kind: "AND", childIds: ["c_scale", "c_ops", "c_roi"] }] },
      { id: "c_scale", type: "claim", label: "Scaling pain gets solved", confidence: 1, groups: [{ kind: "AND", childIds: ["a_load", "a_arch"] }] },
      { id: "c_ops", type: "claim", label: "Team can operate it", confidence: 1, groups: [{ kind: "AND", childIds: ["a_arch", "a_devops"] }] },
      { id: "c_roi", type: "claim", label: "Cost justified by ROI", confidence: 1, groups: [{ kind: "AND", childIds: ["a_bound"] }] },
      { id: "a_load", type: "assumption", label: "Load is uneven across features", confidence: 0.82, groups: [] },
      { id: "a_arch", type: "assumption", label: "Scaling pain is architectural, not org", confidence: 0.55, groups: [] },
      { id: "a_devops", type: "assumption", label: "We have k8s / DevOps maturity", confidence: 0.71, groups: [] },
      { id: "a_bound", type: "assumption", label: "Services have clean boundaries", confidence: 0.78, groups: [] },
    ],
  };
}

export function fixtureAttacks(): Attack[] {
  return [
    { id: "atk_arch", targetId: "a_arch", category: "execution risk", severity: 0.8, rationale: "Your latency traces to N+1 DB queries, not the monolith. Microservices add network hops and would make it worse." },
    { id: "atk_devops", targetId: "a_devops", category: "execution risk", severity: 0.4, rationale: "No team has run a production k8s cluster; on-call maturity is unproven." },
    { id: "atk_bound", targetId: "a_bound", category: "second-order", severity: 0.3, rationale: "Domain boundaries are still shifting; premature splits will need re-merging." },
  ];
}
