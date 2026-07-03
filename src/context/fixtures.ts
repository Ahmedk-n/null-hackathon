import type { Attack, Graph } from "@/engine";
import type {
  CompanyContext,
  ContextInput,
  DecisionContextPack,
} from "./types";

/**
 * Offline hero fixtures. These make the full context demo run with the network
 * off. The context hero GRAPH is deliberately SEPARATE from src/llm/fixture.ts
 * (base a_arch) so the base engine/store tests that hardcode `a_arch` stay green.
 */

export const HERO_CONTEXT_INPUT: ContextInput = {
  decisionText: "Should we migrate to microservices?",
  businessContextText:
    "Enterprise fintech customers. Onboarding speed is our main growth bottleneck. Customers require auditability and reliability; we sell into regulated fintech teams.",
  technicalContextText:
    "FastAPI monolith. Limited observability. No dedicated platform engineer. A distributed architecture would raise operational complexity.",
  temporalContextText:
    "Major enterprise customer meeting tomorrow about reliability, auditability, and implementation timeline. We need a credible near-term technical plan.",
};

export function fixtureCompanyContext(): CompanyContext {
  return {
    business: {
      companyStage: "Series A",
      industry: "Enterprise fintech (regulated)",
      customers: ["Regulated enterprise fintech teams"],
      revenueModel: "Enterprise SaaS contracts",
      competitors: [],
      strategicGoals: ["Win enterprise fintech customers", "Reduce onboarding time"],
      growthBottlenecks: ["Enterprise onboarding speed"],
      marketConstraints: ["Buyers require auditability and reliability guarantees"],
    },
    technical: {
      stack: ["FastAPI", "Python"],
      architecture: "Monolith",
      infrastructure: [],
      integrations: [],
      deploymentProcess: undefined,
      observability: "Limited",
      teamSize: undefined,
      technicalDebt: ["Limited observability"],
      engineeringConstraints: [
        "No dedicated platform engineer",
        "Distributed architecture would raise operational complexity",
      ],
    },
    temporal: {
      upcomingEvents: [
        {
          id: "evt_customer_meeting",
          type: "customer_call",
          title: "Enterprise customer meeting",
          dateDescription: "tomorrow",
          relevanceToDecision:
            "Reliability, auditability, and implementation timeline will be discussed.",
          importance: 0.9,
        },
      ],
      deadlines: [
        {
          id: "dl_credible_plan",
          title: "Credible near-term technical plan",
          dateDescription: "by tomorrow's meeting",
          consequenceIfMissed: "Loss of enterprise credibility and the deal",
          severity: 0.8,
        },
      ],
      urgencyLevel: 0.85,
    },
    constraints: [
      { id: "con_time", type: "time", statement: "A credible plan is needed by tomorrow's meeting.", severity: 0.8 },
      { id: "con_reg", type: "regulatory", statement: "Regulated fintech buyers require auditability.", severity: 0.7 },
      { id: "con_team", type: "team", statement: "No dedicated platform engineer to run distributed systems.", severity: 0.7 },
    ],
    objectives: [
      { id: "obj_close", statement: "Win the enterprise fintech customer.", priority: 0.9 },
      { id: "obj_onboard", statement: "Cut enterprise onboarding time.", priority: 0.7 },
    ],
    knownRisks: [
      { id: "risk_exec", category: "execution", statement: "No time to prove a safe migration before the meeting.", likelihood: 0.7, severity: 0.8 },
      { id: "risk_tech", category: "technical", statement: "Limited observability makes distributed ops risky.", likelihood: 0.6, severity: 0.7 },
    ],
    missingInfo: ["Exact SLA targets", "Current incident rate"],
  };
}

export function fixtureDecisionContextPack(decision?: string): DecisionContextPack {
  return {
    decision: decision ?? HERO_CONTEXT_INPUT.decisionText,
    relevantBusinessFacts: [
      "Enterprise onboarding is the main growth bottleneck.",
      "Customers require auditability and reliability.",
      "Sells into regulated fintech teams.",
    ],
    relevantTechnicalFacts: [
      "Backend is a FastAPI monolith.",
      "Observability is limited.",
      "No dedicated platform engineer.",
      "Distributed architecture increases operational complexity.",
    ],
    relevantTemporalFacts: [
      "Major enterprise customer meeting tomorrow.",
      "Meeting focuses on reliability, auditability, and timeline.",
      "Team needs a credible near-term technical plan.",
    ],
    relevantConstraints: [
      { id: "con_time", type: "time", statement: "A credible plan is needed by tomorrow's meeting.", severity: 0.8 },
      { id: "con_reg", type: "regulatory", statement: "Regulated fintech buyers require auditability.", severity: 0.7 },
    ],
    relevantObjectives: [
      { id: "obj_close", statement: "Win the enterprise fintech customer.", priority: 0.9 },
    ],
    relevantKnownRisks: [
      { id: "risk_exec", category: "execution", statement: "No time to prove a safe migration before the meeting.", likelihood: 0.7, severity: 0.8 },
    ],
    contextWeightAdjustments: [
      { targetCategory: "execution", direction: "increase", magnitude: 0.8, reason: "A major customer meeting tomorrow raises near-term delivery credibility." },
      { targetCategory: "reliability", direction: "increase", magnitude: 0.7, reason: "The meeting centers on enterprise reliability guarantees." },
      { targetCategory: "auditability", direction: "increase", magnitude: 0.7, reason: "Regulated fintech buyers require audit trails." },
      { targetCategory: "timeline", direction: "increase", magnitude: 0.6, reason: "A credible plan is needed by tomorrow, not a long rewrite." },
    ],
    missingInformation: ["Exact SLA targets", "Current incident rate"],
  };
}

/**
 * Context hero graph — 9 nodes, so it lands in the layered-2.5D band.
 * Product-AND aggregation with OR fallbacks on non-keystone legs makes
 * `k_credible` the STRICT keystone (feeds c_exec AND c_reliab). Engine-computed:
 *   baseline integrity ≈ 61.97
 *   keystone = k_credible, impact ≈ 61.97 vs next assumption ≈ 3.6 (>5x)
 *   post-load integrity ≈ 1.43 (< 10)
 *   failures = { T, c_exec, c_reliab, k_credible }; c_roi HOLDS (partial collapse)
 * (All pinned in fixtures.test.ts.)
 */
export function fixtureContextGraph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "Migrate to microservices", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_exec", "c_reliab", "c_roi"] }] },
      { id: "c_exec", type: "claim", label: "We can execute safely near-term", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_credible"] }] },
      { id: "c_reliab", type: "claim", label: "Meets enterprise reliability now", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_credible"] }, { kind: "OR", childIds: ["a_obs", "a_audit"] }] },
      { id: "c_roi", type: "claim", label: "Migration ROI justifies it now", confidence: 1.0, groups: [{ kind: "OR", childIds: ["a_bound", "a_load"] }] },
      { id: "k_credible", type: "assumption", label: "Can explain safe staged migration by meeting", confidence: 0.9, groups: [] },
      { id: "a_obs", type: "assumption", label: "Enough observability for distributed ops", confidence: 0.85, groups: [] },
      { id: "a_audit", type: "assumption", label: "Enterprise values auditability over purity", confidence: 0.8, groups: [] },
      { id: "a_bound", type: "assumption", label: "Services have clean boundaries", confidence: 0.9, groups: [] },
      { id: "a_load", type: "assumption", label: "Load is uneven across features", confidence: 0.85, groups: [] },
    ],
  };
}

export function fixtureContextAttacks(): Attack[] {
  return [
    { id: "atk_k", targetId: "k_credible", category: "execution risk", severity: 0.8, rationale: "With tomorrow's meeting, there is no time to prove a safe staged migration — the plan is not credible yet." },
    { id: "atk_obs", targetId: "a_obs", category: "reliability", severity: 0.4, rationale: "Observability is limited; distributed failure modes would be blind spots." },
    { id: "atk_bound", targetId: "a_bound", category: "second-order", severity: 0.3, rationale: "Domain boundaries are still shifting; premature splits need re-merging." },
    { id: "atk_audit", targetId: "a_audit", category: "auditability", severity: 0.35, rationale: "Audit trails across services are unproven for regulated buyers." },
  ];
}
