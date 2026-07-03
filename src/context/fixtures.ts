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
      { targetCategory: "execution", direction: "increase", magnitude: 1.0, reason: "A major customer meeting tomorrow maximally raises near-term delivery/execution risk." },
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
      // evidence sourced VERBATIM from the scripted gather fixtures (src/agents/fixtures.ts) so the
      // rehearsed demo shows provenance too. Confidence numbers are PINNED — evidence is engine-inert.
      { id: "k_credible", type: "assumption", label: "Can explain safe staged migration by meeting", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Credible near-term technical plan needed by the meeting (tomorrow)." } }, // KEYSTONE — feeds c_exec AND c_reliab
      { id: "a_obs", type: "assumption", label: "Enough observability for distributed ops", confidence: 0.85, groups: [], evidence: { source: "src/", fact: "No tracing/metrics wiring found (observability is limited)." } },
      { id: "a_audit", type: "assumption", label: "Enterprise values auditability over purity", confidence: 0.8, groups: [], evidence: { source: "https://company.example.com/security", fact: "Auditability and reliability required to close." } },
      { id: "a_bound", type: "assumption", label: "Services have clean boundaries", confidence: 0.9, groups: [], evidence: { source: "pyproject.toml", fact: "FastAPI monolith (Python) — boundaries not yet separated." } },
      { id: "a_load", type: "assumption", label: "Load is uneven across features", confidence: 0.85, groups: [], evidence: null }, // no relevant finding → ungrounded
    ],
  };
}

// RAW attack severities (context IGNORED). Tuned so the structure SURVIVES the
// raw assault: the keystone `k_credible` and all three claims hold above the 0.35
// failure threshold. Only when `reweightAttacksByContext` applies the hero pack
// (tomorrow's enterprise meeting → ▲ execution) does the keystone attack cross the
// threshold and fail, cascading c_exec + c_reliab and cratering integrity <10%.
//
// Numbers worked against the engine (integrity = k²·m·r, keystone squared):
//   RAW        → k=0.513 (HOLDS), integrity ≈ 17.1%, failures = {T} only.
//   REWEIGHTED → atk_k 0.43→0.645 (×1.5 execution) → k=0.320 (FAILS),
//                integrity ≈ 6.4%, failures = {T, c_exec, c_reliab, k_credible}; c_roi holds.
export function fixtureContextAttacks(): Attack[] {
  return [
    { id: "atk_k", targetId: "k_credible", category: "execution risk", severity: 0.43, rationale: "With tomorrow's meeting, there is no time to prove a safe staged migration — the plan is not credible yet." },
    { id: "atk_obs", targetId: "a_obs", category: "reliability", severity: 0.1, rationale: "Observability is limited; distributed failure modes would be blind spots." },
    { id: "atk_bound", targetId: "a_bound", category: "second-order", severity: 0.12, rationale: "Domain boundaries are still shifting; premature splits need re-merging." },
    { id: "atk_audit", targetId: "a_audit", category: "auditability", severity: 0.1, rationale: "Audit trails across services are unproven for regulated buyers." },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCENARIO B — "REINFORCE FIRST" (the structure HOLDS under the SAME context)
 * ──────────────────────────────────────────────────────────────────────────
 * Same company (enterprise fintech, FastAPI monolith, meeting tomorrow) but the
 * CONSERVATIVE decision: don't migrate — keep the monolith and hire 2 SREs before
 * the pilot. This proves the tool DISCRIMINATES: the identical "meeting tomorrow"
 * context that CRATERS scenario A (▲ execution/reliability crosses the keystone's
 * threshold) only MILDLY stresses this reinforcement plan — it survives comfortably.
 *
 * Numbers worked against the real engine (integrity = thesis support; AND=product,
 * OR=max; FAILURE_THRESHOLD 0.35; keystone k_sre feeds c_reliab AND c_ready):
 *   BASELINE   → 69.04% healthy; keystone k_sre dominant (69.0 vs 7.7 next).
 *   RAW        → integrity 49.21%, ZERO failures (structure holds).
 *   REWEIGHTED → atk_sre 0.10→0.115 (×1.15 execution), atk_oncall 0.15→0.1725
 *                (×1.15 reliability), atk_budget 0.12 UNCHANGED (unclassifiable);
 *                integrity 47.59%, ZERO failures, keystone k_sre still HOLDS.
 * ════════════════════════════════════════════════════════════════════════ */

export const REINFORCE_CONTEXT_INPUT: ContextInput = {
  businessContextText:
    "Enterprise fintech customers. Onboarding speed matters, but the deal on the table hinges on demonstrable reliability, not new architecture. We sell into regulated fintech teams who buy on trust and uptime.",
  technicalContextText:
    "FastAPI monolith that is stable today. The real gap is operational maturity: limited observability and no dedicated platform/on-call ownership. Adding operators is cheaper and safer than re-architecting under deadline.",
  temporalContextText:
    "Major enterprise customer meeting tomorrow about reliability, auditability, and implementation timeline. We need a credible near-term plan we can actually deliver before the pilot.",
  decisionText: "Should we keep the monolith and hire 2 SREs to harden reliability before the pilot?",
};

export function fixtureCompanyContextB(): CompanyContext {
  return {
    business: {
      companyStage: "Series A",
      industry: "Enterprise fintech",
      customers: ["Regulated fintech teams", "Enterprise finance orgs"],
      revenueModel: "B2B SaaS subscriptions",
      competitors: [],
      strategicGoals: ["Win the enterprise pilot", "Prove reliability without a rewrite"],
      growthBottlenecks: ["Operational reliability confidence"],
      marketConstraints: ["Buyers require auditability and reliability"],
    },
    technical: {
      stack: ["FastAPI", "Python", "PostgreSQL"],
      architecture: "Monolith (retained)",
      infrastructure: ["Single deployment"],
      integrations: [],
      deploymentProcess: "Manual / CI deploy",
      observability: "Limited — being hardened",
      teamSize: 6,
      technicalDebt: ["Limited observability", "No platform/on-call ownership"],
      engineeringConstraints: ["Reliability must improve without a rewrite before the pilot"],
    },
    temporal: {
      upcomingEvents: [
        {
          id: "evt_meeting",
          type: "customer_call",
          title: "Enterprise customer meeting",
          dateDescription: "tomorrow",
          relevanceToDecision:
            "Buyer will probe reliability, auditability, and a deliverable near-term plan.",
          importance: 0.9,
        },
      ],
      deadlines: [
        {
          id: "dl_pilot",
          title: "Reliability hardening before the pilot",
          dateDescription: "before the pilot window",
          consequenceIfMissed: "Pilot slips or fails on reliability.",
          severity: 0.7,
        },
      ],
      urgencyLevel: 0.8,
    },
    constraints: [
      { id: "con_time", type: "time", statement: "Deliverable reliability plan needed before the pilot.", severity: 0.7 },
      { id: "con_reg", type: "regulatory", statement: "Regulated fintech buyers require audit trails.", severity: 0.7 },
    ],
    objectives: [
      { id: "obj_pilot", statement: "Land the enterprise pilot on reliability.", priority: 0.9 },
    ],
    knownRisks: [
      { id: "risk_hire", category: "execution", statement: "SRE hiring/onboarding may slip the pilot window.", likelihood: 0.4, severity: 0.5 },
      { id: "risk_obs", category: "technical", statement: "Observability still maturing during hardening.", likelihood: 0.4, severity: 0.4 },
    ],
    missingInfo: ["Exact SLA targets", "SRE hiring lead time"],
  };
}

export function fixtureDecisionContextPackB(decision?: string): DecisionContextPack {
  return {
    decision: decision ?? REINFORCE_CONTEXT_INPUT.decisionText,
    relevantBusinessFacts: [
      "The pilot hinges on demonstrable reliability, not new architecture.",
      "Buyers are regulated fintech teams who value uptime and trust.",
      "Reliability confidence is the real growth bottleneck.",
    ],
    relevantTechnicalFacts: [
      "The FastAPI monolith is stable today.",
      "The gap is operational maturity, not architecture.",
      "Adding SREs hardens reliability without a rewrite.",
      "Observability is limited but being hardened.",
    ],
    relevantTemporalFacts: [
      "Major enterprise customer meeting tomorrow.",
      "Meeting focuses on reliability, auditability, and timeline.",
      "A deliverable near-term plan is needed before the pilot.",
    ],
    relevantConstraints: [
      { id: "con_time", type: "time", statement: "Deliverable reliability plan needed before the pilot.", severity: 0.7 },
      { id: "con_reg", type: "regulatory", statement: "Regulated fintech buyers require audit trails.", severity: 0.7 },
    ],
    relevantObjectives: [
      { id: "obj_pilot", statement: "Land the enterprise pilot on reliability.", priority: 0.9 },
    ],
    relevantKnownRisks: [
      { id: "risk_hire", category: "execution", statement: "SRE hiring/onboarding may slip the pilot window.", likelihood: 0.4, severity: 0.5 },
      { id: "risk_obs", category: "technical", statement: "Observability still maturing during hardening.", likelihood: 0.4, severity: 0.4 },
    ],
    // Same context SHAPE as the hero (a meeting tomorrow ▲ execution/reliability/
    // timeline/auditability) but the reinforcement plan absorbs it: the amplified
    // severities stay well below the keystone's threshold. Discrimination, not collapse.
    contextWeightAdjustments: [
      { targetCategory: "execution", direction: "increase", magnitude: 0.3, reason: "Tomorrow's meeting raises near-term delivery risk on the hiring plan." },
      { targetCategory: "reliability", direction: "increase", magnitude: 0.3, reason: "The meeting centers on enterprise reliability guarantees." },
      { targetCategory: "timeline", direction: "increase", magnitude: 0.4, reason: "A deliverable plan is needed before the pilot window." },
      { targetCategory: "auditability", direction: "increase", magnitude: 0.3, reason: "Regulated fintech buyers require audit trails." },
    ],
    missingInformation: ["Exact SLA targets", "SRE hiring lead time"],
  };
}

// Scenario B graph — 7 nodes → Band 1 (simple-2d, pickLayoutMode ≤ 8). The keystone
// `k_sre` feeds BOTH claims (AND), so it is uniquely load-bearing; the other assumptions
// sit in OR groups (redundant), so knocking them out barely moves integrity.
export function fixtureContextGraphB(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "Reinforce before pilot (keep monolith, hire 2 SREs)", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_reliab", "c_ready"] }] },
      { id: "c_reliab", type: "claim", label: "Reliability improves enough for the pilot", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_sre"] }, { kind: "OR", childIds: ["a_runbook", "a_oncall"] }] },
      { id: "c_ready", type: "claim", label: "Team is operationally ready by the pilot", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_sre"] }, { kind: "OR", childIds: ["a_oncall", "a_budget"] }] },
      // evidence where natural (the operational-ownership gap grounds the SRE keystone), null elsewhere.
      { id: "k_sre", type: "assumption", label: "2 SREs hired & onboarded before the pilot", confidence: 0.95, groups: [], evidence: { source: "src/", fact: "No platform/infra owner in CODEOWNERS — operational ownership gap." } }, // KEYSTONE — feeds c_reliab AND c_ready
      { id: "a_runbook", type: "assumption", label: "Runbooks cover the main incident classes", confidence: 0.85, groups: [], evidence: null },
      { id: "a_oncall", type: "assumption", label: "On-call rotation is viable with the current team", confidence: 0.8, groups: [], evidence: null },
      { id: "a_budget", type: "assumption", label: "Budget approved for two SRE hires", confidence: 0.9, groups: [], evidence: null },
    ],
  };
}

// RAW attack severities (context IGNORED) — a conservative plan draws milder fire.
// Under the SAME hero-shaped reweight (▲ execution/reliability) the keystone attack
// climbs only 0.10→0.115 and stays far below the 0.35 threshold, so the structure
// HOLDS (see numbers block above). `atk_budget`'s "budget" category is unclassifiable
// by normaliseCategory, so context leaves it unchanged.
export function fixtureContextAttacksB(): Attack[] {
  return [
    { id: "atk_sre", targetId: "k_sre", category: "execution risk", severity: 0.1, rationale: "Hiring two SREs before the pilot is a real delivery risk, but a bounded and well-understood one." },
    { id: "atk_oncall", targetId: "a_oncall", category: "reliability", severity: 0.15, rationale: "A thin on-call rotation on the current team is stretched, though runbooks backstop it." },
    { id: "atk_budget", targetId: "a_budget", category: "budget", severity: 0.12, rationale: "Two headcount is a modest, already-scoped spend against the pilot's value." },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCENARIO REGISTRY — one place the UI + fixture chain agree on scenarios.
 * A (default) = the hero migrate decision that COLLAPSES under context.
 * B           = the reinforce decision that HOLDS under the same context.
 * ════════════════════════════════════════════════════════════════════════ */
export type ScenarioId = "A" | "B";

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  input: ContextInput;
}

export const SCENARIOS: Record<ScenarioId, ScenarioMeta> = {
  A: { id: "A", label: "A — Migrate before pilot (collapses)", input: HERO_CONTEXT_INPUT },
  B: { id: "B", label: "B — Reinforce first (holds)", input: REINFORCE_CONTEXT_INPUT },
};

export function isScenarioId(v: unknown): v is ScenarioId {
  return v === "A" || v === "B";
}

