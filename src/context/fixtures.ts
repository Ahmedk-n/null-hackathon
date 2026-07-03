// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import type { Attack, Graph } from "@/engine";
import type {
  CompanyContext,
  ContextInput,
  DecisionContextPack,
} from "./types";

export const HERO_CONTEXT_INPUT: ContextInput = {
  businessContextText:
    "Enterprise fintech customers. Onboarding speed is our main growth bottleneck. Customers require auditability and reliability; we sell into regulated fintech teams.",
  technicalContextText:
    "FastAPI monolith. Limited observability. No dedicated platform engineer. A distributed architecture would raise operational complexity.",
  temporalContextText:
    "Major enterprise customer meeting tomorrow about reliability, auditability, and implementation timeline. We need a credible near-term technical plan.",
  decisionText: "Should we migrate to microservices?",
};

export function fixtureCompanyContext(): CompanyContext {
  return {
    business: {
      companyStage: "Series A",
      industry: "Enterprise fintech",
      customers: ["Regulated fintech teams", "Enterprise finance orgs"],
      revenueModel: "B2B SaaS subscriptions",
      competitors: [],
      strategicGoals: ["Win enterprise customers", "Speed up onboarding"],
      growthBottlenecks: ["Enterprise onboarding speed"],
      marketConstraints: ["Buyers require auditability and reliability"],
    },
    technical: {
      stack: ["FastAPI", "Python", "PostgreSQL"],
      architecture: "Monolith",
      infrastructure: ["Single deployment"],
      integrations: [],
      deploymentProcess: "Manual / CI deploy",
      observability: "Limited",
      teamSize: 6,
      technicalDebt: ["Limited observability", "No platform engineer"],
      engineeringConstraints: ["Distributed architecture raises operational complexity"],
    },
    temporal: {
      upcomingEvents: [
        {
          id: "evt_meeting",
          type: "customer_call",
          title: "Enterprise customer meeting",
          dateDescription: "tomorrow",
          relevanceToDecision:
            "Buyer will probe reliability, auditability, and migration timeline.",
          importance: 0.9,
        },
      ],
      deadlines: [
        {
          id: "dl_plan",
          title: "Credible near-term technical plan",
          dateDescription: "by tomorrow's meeting",
          consequenceIfMissed: "Lose enterprise deal credibility.",
          severity: 0.8,
        },
      ],
      urgencyLevel: 0.85,
    },
    constraints: [
      { id: "con_time", type: "time", statement: "Credible plan needed by tomorrow.", severity: 0.8 },
      { id: "con_reg", type: "regulatory", statement: "Regulated fintech buyers require audit trails.", severity: 0.7 },
    ],
    objectives: [
      { id: "obj_win", statement: "Win the enterprise customer.", priority: 0.9 },
    ],
    knownRisks: [
      { id: "risk_exec", category: "execution", statement: "No time to prove a safe staged migration.", likelihood: 0.7, severity: 0.8 },
      { id: "risk_tech", category: "technical", statement: "Limited observability for distributed ops.", likelihood: 0.6, severity: 0.6 },
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
      { id: "con_time", type: "time", statement: "Credible plan needed by tomorrow.", severity: 0.8 },
      { id: "con_reg", type: "regulatory", statement: "Regulated fintech buyers require audit trails.", severity: 0.7 },
    ],
    relevantObjectives: [
      { id: "obj_win", statement: "Win the enterprise customer.", priority: 0.9 },
    ],
    relevantKnownRisks: [
      { id: "risk_exec", category: "execution", statement: "No time to prove a safe staged migration.", likelihood: 0.7, severity: 0.8 },
      { id: "risk_tech", category: "technical", statement: "Limited observability for distributed ops.", likelihood: 0.6, severity: 0.6 },
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

// Product-AND aggregation (base engine), OR groups on non-keystone legs so the keystone
// (k_credible) is STRICTLY load-bearing (real impact gap, not a sort-order tie). 9 nodes → Band 2.
export function fixtureContextGraph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "Migrate to microservices", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_exec", "c_reliab", "c_roi"] }] },
      { id: "c_exec", type: "claim", label: "We can execute safely near-term", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_credible"] }] },
      { id: "c_reliab", type: "claim", label: "Meets enterprise reliability now", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_credible"] }, { kind: "OR", childIds: ["a_obs", "a_audit"] }] },
      { id: "c_roi", type: "claim", label: "Migration ROI justifies it now", confidence: 1.0, groups: [{ kind: "OR", childIds: ["a_bound", "a_load"] }] },
      { id: "k_credible", type: "assumption", label: "Can explain safe staged migration by meeting", confidence: 0.9, groups: [] }, // KEYSTONE — feeds c_exec AND c_reliab
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
