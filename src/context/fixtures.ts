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

// V7-1 · DEEPER hero A (13 nodes, 5 layers) under the depth-robust typed-AND rule
// (propagation.ts): thesis → claims (PRODUCT spine, so the keystone still craters it) →
// assumptions → sub-assumption / evidence-support nodes. The keystone `k_credible` is a
// LEAF on the single-child AND spine feeding c_exec AND c_reliab (so it is STRICTLY
// load-bearing and visibly cracks). Depth lives in the NON-keystone branches: `a_obs`
// and `a_bound` each decompose into two leaf evidence-support nodes aggregated by the
// GEOMETRIC MEAN (all-children-leaf AND), so honest corroborating support stays
// meaningful instead of multiplying the branch to ~0. 13 nodes → Band 2 (layered-2-5d).
export function fixtureContextGraph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "Migrate to microservices", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_exec", "c_reliab", "c_roi"] }] },
      { id: "c_exec", type: "claim", label: "We can execute safely near-term", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_credible"] }] },
      { id: "c_reliab", type: "claim", label: "Meets enterprise reliability now", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_credible"] }, { kind: "OR", childIds: ["a_obs", "a_audit"] }] },
      { id: "c_roi", type: "claim", label: "Migration ROI justifies it now", confidence: 1.0, groups: [{ kind: "OR", childIds: ["a_bound", "a_load"] }] },
      // KEYSTONE — leaf on the single-child spine feeding c_exec AND c_reliab. Evidence
      // sourced VERBATIM from the scripted gather fixtures (src/agents/fixtures.ts).
      { id: "k_credible", type: "assumption", label: "Can explain safe staged migration by meeting", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Credible near-term technical plan needed by the meeting (tomorrow)." } },
      // a_obs decomposes into two evidence-support leaves (all-leaf AND → geometric mean).
      { id: "a_obs", type: "assumption", label: "Enough observability for distributed ops", confidence: 1.0, groups: [{ kind: "AND", childIds: ["s_tracing", "s_metrics"] }] },
      { id: "s_tracing", type: "assumption", label: "Distributed tracing is wired", confidence: 0.85, groups: [], evidence: { source: "src/", fact: "No tracing wiring found (observability is limited)." } },
      { id: "s_metrics", type: "assumption", label: "Per-service metrics exist", confidence: 0.85, groups: [], evidence: { source: "src/", fact: "No metrics/dashboards found for distributed ops." } },
      { id: "a_audit", type: "assumption", label: "Enterprise values auditability over purity", confidence: 0.8, groups: [], evidence: { source: "https://company.example.com/security", fact: "Auditability and reliability required to close." } },
      // a_bound decomposes too (depth in the ROI holding branch).
      { id: "a_bound", type: "assumption", label: "Services have clean boundaries", confidence: 1.0, groups: [{ kind: "AND", childIds: ["s_domain", "s_split"] }] },
      { id: "s_domain", type: "assumption", label: "Domain modules are separable", confidence: 0.9, groups: [], evidence: { source: "pyproject.toml", fact: "FastAPI monolith (Python) — domain modules not yet separated." } },
      { id: "s_split", type: "assumption", label: "Split lines are stable", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Service split lines are still shifting week to week." } },
      { id: "a_load", type: "assumption", label: "Load is uneven across features", confidence: 0.85, groups: [], evidence: null }, // no relevant finding → ungrounded
    ],
  };
}

// RAW attack severities (context IGNORED). Tuned so the structure SURVIVES the raw
// assault: the keystone `k_credible` and all three claims hold above the 0.35 failure
// threshold (only the thesis dips). Only when `reweightAttacksByContext` applies the
// hero pack (tomorrow's enterprise meeting → ▲ execution) does the keystone attack
// cross the threshold and fail, cascading c_exec + c_reliab and cratering integrity <10%.
//
// Numbers worked against the depth-robust engine (typed-AND: PRODUCT thesis spine,
// GEOMETRIC-MEAN evidence groups; threshold 0.35):
//   BASELINE   → 61.97% (standing); keystone k_credible strictly dominant (62.0 vs 3.6 next).
//   RAW        → integrity 18.04%, failures = {T} only (keystone + all claims HOLD).
//   REWEIGHTED → atk_k 0.43→0.645 (×1.5 execution) → k_credible FAILS; integrity 6.86%,
//                failures = {T, c_exec, c_reliab, k_credible}; c_roi HOLDS at 85%.
export function fixtureContextAttacks(): Attack[] {
  return [
    { id: "atk_k", targetId: "k_credible", category: "execution risk", severity: 0.43, rationale: "With tomorrow's meeting, there is no time to prove a safe staged migration — the plan is not credible yet." },
    { id: "atk_obs", targetId: "s_tracing", category: "reliability", severity: 0.1, rationale: "Observability is limited; distributed failure modes would be blind spots." },
    { id: "atk_bound", targetId: "s_domain", category: "second-order", severity: 0.12, rationale: "Domain boundaries are still shifting; premature splits need re-merging." },
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

// Scenario B graph — 9 nodes → Band 2 (layered-2-5d). The keystone `k_sre` feeds BOTH
// claims on the single-child AND spine, so it is uniquely load-bearing; the other
// assumptions sit in OR groups (redundant). Depth: `a_runbook` decomposes into two
// leaf evidence-support nodes (all-leaf AND → geometric mean), so the added corroboration
// keeps that branch high instead of multiplying it down — depth WITHOUT self-inflicted collapse.
export function fixtureContextGraphB(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "Reinforce before pilot (keep monolith, hire 2 SREs)", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_reliab", "c_ready"] }] },
      { id: "c_reliab", type: "claim", label: "Reliability improves enough for the pilot", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_sre"] }, { kind: "OR", childIds: ["a_runbook", "a_oncall"] }] },
      { id: "c_ready", type: "claim", label: "Team is operationally ready by the pilot", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_sre"] }, { kind: "OR", childIds: ["a_oncall", "a_budget"] }] },
      // evidence where natural (the operational-ownership gap grounds the SRE keystone), null elsewhere.
      { id: "k_sre", type: "assumption", label: "2 SREs hired & onboarded before the pilot", confidence: 0.95, groups: [], evidence: { source: "src/", fact: "No platform/infra owner in CODEOWNERS — operational ownership gap." } }, // KEYSTONE — feeds c_reliab AND c_ready
      { id: "a_runbook", type: "assumption", label: "Runbooks cover the main incident classes", confidence: 1.0, groups: [{ kind: "AND", childIds: ["s_incident", "s_drill"] }] },
      { id: "s_incident", type: "assumption", label: "Incident classes are catalogued", confidence: 0.85, groups: [], evidence: null },
      { id: "s_drill", type: "assumption", label: "Runbooks are drilled", confidence: 0.85, groups: [], evidence: null },
      { id: "a_oncall", type: "assumption", label: "On-call rotation is viable with the current team", confidence: 0.8, groups: [], evidence: null },
      { id: "a_budget", type: "assumption", label: "Budget approved for two SRE hires", confidence: 0.9, groups: [], evidence: null },
    ],
  };
}

// RAW attack severities (context IGNORED) — a conservative plan draws milder fire.
// Under the SAME hero-shaped reweight (▲ execution/reliability) the keystone attack
// climbs only 0.10→0.115 and stays far below the 0.35 threshold, so the structure HOLDS.
// `atk_budget`'s "budget" category is unclassifiable by normaliseCategory → unchanged.
//
// Numbers worked against the depth-robust engine (typed-AND; threshold 0.35):
//   BASELINE   → 69.04% healthy; keystone k_sre dominant (69.0 vs 7.7 next).
//   RAW        → integrity 49.21%, ZERO failures (structure holds).
//   REWEIGHTED → integrity 47.59%, ZERO failures, keystone k_sre still HOLDS. Discrimination, not collapse.
export function fixtureContextAttacksB(): Attack[] {
  return [
    { id: "atk_sre", targetId: "k_sre", category: "execution risk", severity: 0.1, rationale: "Hiring two SREs before the pilot is a real delivery risk, but a bounded and well-understood one." },
    { id: "atk_oncall", targetId: "a_oncall", category: "reliability", severity: 0.15, rationale: "A thin on-call rotation on the current team is stretched, though runbooks backstop it." },
    { id: "atk_budget", targetId: "a_budget", category: "budget", severity: 0.12, rationale: "Two headcount is a modest, already-scoped spend against the pilot's value." },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCENARIO R — "EXCALIDRAW · REAL" (a REAL project, generated live, pinned)
 * ──────────────────────────────────────────────────────────────────────────
 * Produced by scripts/generate-scenario-r.mjs driving the live pipeline end-to-end
 * (2026-07-04): the technical agent shallow-cloned github.com/excalidraw/excalidraw
 * and explored it with read-only tools; the business agent crawled excalidraw.com +
 * competitors (tldraw / Figma FigJam / Miro); the temporal agent parsed a real-shaped
 * roadmap situation; then live /api/context → /api/extract → /api/attacks. All six
 * stages returned source="live" (see scripts/scenario-r.artifacts.json). The STRUCTURE
 * and every EVIDENCE provenance string (real repo file paths + real URLs) are VERBATIM
 * from that live run; long fact strings are trimmed for the ledger but never invented.
 *
 * DECISION: build Excalidraw's own paid realtime-collaboration backend now, vs. keep
 * relying on the open-source excalidraw-room + third-party embeds.
 *
 * DEMO BEAT — grounded collapse with a partial hold (numbers worked against the depth-
 * robust engine; integrity = thesis support ×100, typed-AND [PRODUCT thesis spine,
 * GEOMETRIC-MEAN evidence groups], OR=max, threshold 0.35):
 *   BASELINE   → 55.40% (standing; thesis+claims pinned 1.0 per the fixture convention,
 *                assumption confidences reflect the live model's real skepticism).
 *   RAW        → integrity 18.56%; the load-bearing keystone team_has_backend_capacity
 *                HOLDS at support 0.400; the differentiation claim HOLDS at 0.900.
 *   REWEIGHTED → the pack's ▲execution 0.8 (roadmap meeting in 2 days, 6-person team,
 *                no backend history) amplifies the keystone's execution attack 0.50→0.70;
 *                the keystone CRACKS to 0.240, thesis craters to 9.69%, and
 *                differentiates_vs_competitors STILL HOLDS at 0.900 — a partial collapse.
 * The keystone flips hold→fail purely from grounding the SAME attacks in context.
 *
 * KEYSTONE NOTE: the thesis is a PRODUCT of three claims, and the keystone
 * team_has_backend_capacity sits alone on team_can_build_operate_infra's single-child AND
 * spine, while backend_drives_conversion's conversion assumption (and its two sub-leaves)
 * are likewise on hard spines — so knocking ANY of those AND-spine assumptions to zero
 * zeroes the thesis and they TIE on load-bearing impact. The OR-leg assumptions
 * (can_reimplement_e2e_collab, reliability_observability_ready, enterprise_pipeline_real,
 * competitive_urgency_real) are redundant → ~0 impact. keystone() resolves the tie by node
 * order to team_has_backend_capacity — the weakest-confidence, most-attacked leg, exactly
 * the right demo keystone.
 * ════════════════════════════════════════════════════════════════════════ */

// Seeds for the CONTEXT tab R segment — the three live gather summaries + the decision.
export const REAL_CONTEXT_INPUT: ContextInput = {
  businessContextText:
    "Excalidraw is a bootstrapped, open-source (MIT-licensed) virtual collaborative whiteboard, launched in 2020 by former Meta engineer Christopher Chedeau and run by a ~6-person team in Brno, Czech Republic. Freemium model: the core app is free forever; Excalidraw+ is a paid seat-based cloud tier (~$6/user/mo billed yearly) targeting teams and enterprises. Differentiation is deliberate simplicity, a sketch-like aesthetic, privacy-first end-to-end encryption, and no-signup access. Competes with tldraw (open-source infinite-canvas SDK, VC-backed ~$14M raised), Figma FigJam (bundled into Figma seats), and Miro (enterprise leader, ~90-100M users, ~$665M ARR, $17.5B valuation). Key growth constraints: converting free users into paid Excalidraw+ subscribers, limited enterprise support capacity from the tiny team, and meeting enterprise auditability/reliability/security demands (SOC 2 Type II + DPA) against far larger, better-funded rivals.",
  technicalContextText:
    "Excalidraw is a TypeScript monorepo (Yarn workspaces) whose flagship deliverable is a React 19 npm component library, plus a reference web app (excalidraw-app) hosting excalidraw.com. Client-heavy, canvas-based SPA built with Vite (PWA, offline service worker), split into internal packages (common, element, math, excalidraw, utils, fractional-indexing, laser-pointer). The hosted app has no traditional backend of its own: real-time collaboration runs over Socket.IO with end-to-end encryption, and scene/file persistence uses Firebase Firestore + Storage, with local-first storage via idb-keyval. State via Jotai; deploy via Vercel (web app) and a multi-stage Docker/nginx image (self-hosting). Observability is limited to Sentry error tracking; CI (GitHub Actions) runs Vitest, ESLint, Prettier, typecheck, size-limit, and locale coverage.",
  temporalContextText:
    "There is a near-term internal team planning meeting on the collaboration roadmap in 2 days, making it the most immediate time pressure. A conference talk submission deadline on the collaboration story falls in 3 weeks, and the next quarterly board update covering the monetization plan is in 6 weeks. Competitive pressure from tldraw's recent funding and aggressive SDK shipping adds urgency to these decisions.",
  decisionText:
    "Should Excalidraw build a paid realtime-collaboration backend (own infra) now, instead of continuing to rely on the open-source excalidraw-room and third-party embeds?",
};

export function fixtureCompanyContextR(): CompanyContext {
  return {
    business: {
      companyStage: "bootstrapped early-stage open-source",
      industry: "collaborative whiteboarding / diagramming software",
      customers: [
        "individual developers",
        "small-to-mid-market product teams",
        "engineering teams",
        "business teams",
        "enterprises via Excalidraw+",
      ],
      revenueModel: "freemium; seat-based Excalidraw+ cloud tier (~$6/user/mo yearly)",
      competitors: ["tldraw", "Figma FigJam", "Miro"],
      strategicGoals: [
        "convert free users into Excalidraw+ subscribers",
        "meet enterprise auditability/reliability/security demands",
        "preserve deliberate simplicity and privacy-first differentiation",
      ],
      growthBottlenecks: [
        "free/open-source to paid conversion",
        "limited enterprise support capacity from tiny team",
        "enterprise auditability/reliability/security expectations",
      ],
      marketConstraints: [
        "far larger, better-funded rivals (Miro $17.5B, tldraw ~$14M raised)",
        "enterprise complexity expectations vs simplicity positioning",
      ],
    },
    technical: {
      stack: ["TypeScript", "React 19", "Vite", "Jotai", "Socket.IO", "Firebase Firestore", "Firebase Storage", "idb-keyval"],
      architecture: "client-heavy canvas SPA; npm component library in Yarn monorepo",
      infrastructure: ["Vercel (web app)", "Docker/nginx multi-stage image (self-hosting)", "Firebase"],
      integrations: ["Firebase Firestore", "Firebase Storage", "excalidraw-room", "third-party embeds"],
      deploymentProcess: "Vercel for web app; Docker/nginx for self-hosting",
      observability: "limited to Sentry error tracking",
      teamSize: 6,
      technicalDebt: [
        "no traditional backend of its own",
        "reliance on open-source excalidraw-room for realtime collab",
      ],
      engineeringConstraints: [
        "tiny team (~6 people)",
        "end-to-end encryption requirement for collaboration",
        "local-first, offline-capable design",
      ],
    },
    temporal: {
      upcomingEvents: [
        {
          id: "evt_roadmap",
          type: "architecture_review",
          title: "Collaboration roadmap planning meeting",
          dateDescription: "in 2 days",
          relevanceToDecision: "Sets the near-term stance on building an own realtime backend.",
          importance: 0.9,
        },
        {
          id: "evt_talk",
          type: "launch",
          title: "Conference talk submission (collaboration story)",
          dateDescription: "in 3 weeks",
          relevanceToDecision: "The collaboration narrative shapes what can be credibly announced.",
          importance: 0.6,
        },
        {
          id: "evt_board",
          type: "board_update",
          title: "Quarterly board update (monetization plan)",
          dateDescription: "in 6 weeks",
          relevanceToDecision: "Backend investment competes with the paid-conversion monetization plan.",
          importance: 0.7,
        },
      ],
      deadlines: [
        {
          id: "dl_roadmap",
          title: "Near-term collaboration-backend direction",
          dateDescription: "by the roadmap meeting (2 days)",
          consequenceIfMissed: "Roadmap stalls; ceding collaboration momentum to tldraw.",
          severity: 0.7,
        },
      ],
      urgencyLevel: 0.8,
    },
    constraints: [
      { id: "con-team", type: "team", statement: "Tiny ~6-person team with limited enterprise support capacity", severity: 0.8 },
      { id: "con-time", type: "time", statement: "Roadmap planning meeting in 2 days forces near-term direction", severity: 0.6 },
      { id: "con-budget", type: "budget", statement: "Bootstrapped; must self-fund infrastructure investments", severity: 0.7 },
      { id: "con-technical", type: "technical", statement: "Currently no own backend; relies on excalidraw-room and Firebase", severity: 0.6 },
      { id: "con-regulatory", type: "regulatory", statement: "Enterprise SOC 2 Type II, DPA and E2E encryption expectations", severity: 0.7 },
      { id: "con-market", type: "market", statement: "Competing against far larger, better-funded rivals", severity: 0.6 },
    ],
    objectives: [
      { id: "obj-convert", statement: "Convert free/open-source users into paid Excalidraw+ subscribers", priority: 0.9 },
      { id: "obj-enterprise", statement: "Meet enterprise reliability, auditability, and security demands", priority: 0.8 },
      { id: "obj-simplicity", statement: "Preserve simplicity and privacy-first differentiation", priority: 0.7 },
    ],
    knownRisks: [
      { id: "risk-capacity", category: "execution", statement: "Tiny team may lack capacity to build and operate own backend", likelihood: 0.7, severity: 0.7 },
      { id: "risk-competitor", category: "competitor", statement: "tldraw funding and aggressive SDK shipping pressures collaboration decisions", likelihood: 0.6, severity: 0.5 },
      { id: "risk-reliability", category: "technical", statement: "Owning realtime backend adds reliability burden without prior backend experience", likelihood: 0.5, severity: 0.7 },
      { id: "risk-opp-cost", category: "opportunity_cost", statement: "Backend build diverts scarce team from conversion and features", likelihood: 0.6, severity: 0.6 },
    ],
    missingInfo: [
      "Current Excalidraw+ subscriber count and conversion rate",
      "Cost/limitations of relying on excalidraw-room today",
      "Specific enterprise customer requirements driving backend need",
      "Available runway or budget for infrastructure investment",
      "Current realtime reliability metrics or incidents",
    ],
  };
}

export function fixtureDecisionContextPackR(decision?: string): DecisionContextPack {
  return {
    decision: decision ?? REAL_CONTEXT_INPUT.decisionText,
    relevantBusinessFacts: [
      "Bootstrapped freemium; Excalidraw+ is the paid seat-based tier",
      "Growth bottleneck is converting free users to paid subscribers",
      "Enterprise auditability/reliability/security demands must be met",
      "Competes with better-funded tldraw, FigJam, and Miro",
    ],
    relevantTechnicalFacts: [
      "Hosted app has no traditional backend of its own",
      "Realtime collab runs over Socket.IO with end-to-end encryption",
      "Persistence uses Firebase Firestore/Storage; local-first idb-keyval",
      "Currently relies on open-source excalidraw-room",
      "Observability limited to Sentry error tracking",
    ],
    relevantTemporalFacts: [
      "Collaboration roadmap planning meeting in 2 days",
      "Conference talk submission on collaboration in 3 weeks",
      "Quarterly board update on monetization in 6 weeks",
      "tldraw funding/SDK shipping adds competitive urgency",
    ],
    // ≥2 constraint-shaped entries (V4-2 renders these as boundary planes). Kept verbatim
    // from the live pack: team, budget, technical, regulatory, and time constraints.
    relevantConstraints: [
      { id: "con-team", type: "team", statement: "Tiny ~6-person team with limited enterprise support capacity", severity: 0.8 },
      { id: "con-budget", type: "budget", statement: "Bootstrapped; must self-fund infrastructure investments", severity: 0.7 },
      { id: "con-technical", type: "technical", statement: "Currently no own backend; relies on excalidraw-room and Firebase", severity: 0.6 },
      { id: "con-regulatory", type: "regulatory", statement: "Enterprise SOC 2 Type II, DPA and E2E encryption expectations", severity: 0.7 },
      { id: "con-time", type: "time", statement: "Roadmap planning meeting in 2 days forces near-term direction", severity: 0.6 },
    ],
    relevantObjectives: [
      { id: "obj-convert", statement: "Convert free/open-source users into paid Excalidraw+ subscribers", priority: 0.9 },
      { id: "obj-enterprise", statement: "Meet enterprise reliability, auditability, and security demands", priority: 0.8 },
      { id: "obj-simplicity", statement: "Preserve simplicity and privacy-first differentiation", priority: 0.7 },
    ],
    relevantKnownRisks: [
      { id: "risk-capacity", category: "execution", statement: "Tiny team may lack capacity to build and operate own backend", likelihood: 0.7, severity: 0.7 },
      { id: "risk-reliability", category: "technical", statement: "Owning realtime backend adds reliability burden without prior backend experience", likelihood: 0.5, severity: 0.7 },
      { id: "risk-opp-cost", category: "opportunity_cost", statement: "Backend build diverts scarce team from conversion and features", likelihood: 0.6, severity: 0.6 },
      { id: "risk-competitor", category: "competitor", statement: "tldraw funding and aggressive SDK shipping pressures collaboration decisions", likelihood: 0.6, severity: 0.5 },
    ],
    // The live compile's own weight adjustments (verbatim). ▲execution 0.8 is the lever that
    // grounds the keystone attack (0.50→0.70) and cracks the "team has capacity" assumption.
    contextWeightAdjustments: [
      { targetCategory: "timeline", direction: "increase", magnitude: 0.7, reason: "Roadmap planning meeting in 2 days demands a near-term stance before building anything large." },
      { targetCategory: "execution", direction: "increase", magnitude: 0.8, reason: "A ~6-person team with no prior backend limits capacity to build/operate own infra now." },
      { targetCategory: "opportunity_cost", direction: "increase", magnitude: 0.7, reason: "Backend build competes with the priority goal of converting free users to Excalidraw+." },
      { targetCategory: "reliability", direction: "increase", magnitude: 0.7, reason: "Owning realtime infra raises reliability burden while observability is only Sentry error tracking." },
      { targetCategory: "auditability", direction: "increase", magnitude: 0.6, reason: "Enterprise SOC 2 Type II and DPA demands make own-backend auditability a differentiator." },
      { targetCategory: "technical", direction: "increase", magnitude: 0.5, reason: "Replacing excalidraw-room requires reimplementing E2E-encrypted Socket.IO collaboration on own infra." },
      { targetCategory: "competitor", direction: "increase", magnitude: 0.4, reason: "tldraw's recent funding and aggressive SDK shipping add urgency to the collaboration decision." },
    ],
    missingInformation: [
      "Cost and reliability limits of current excalidraw-room dependency",
      "Specific enterprise requirements forcing an own backend",
      "Available budget/runway for building and operating infra",
      "Excalidraw+ conversion metrics to weigh revenue upside",
      "Estimated engineering effort and timeline for the backend",
    ],
  };
}

// Scenario R graph — 13 nodes → Band 2. STRUCTURE + EVIDENCE from the live extract (real
// repo file paths + real URLs), RE-AUTHORED DEEPER (V7-1): the keystone
// `team_has_backend_capacity` now sits ALONE on the single-child AND spine of
// team_can_build_operate_infra (so grounded execution load craters it), with the two
// other build assumptions moved into an OR (redundant reliability path). Depth:
// `conversion_is_collab_limited` decomposes into two leaf evidence-support nodes
// (all-leaf AND → geometric mean). Confidence numbers pinned by the fixture author
// (thesis/claims 1.0; assumption confidences carry the live model's relative skepticism —
// the capacity keystone lowest). Engine-inert evidence.
export function fixtureContextGraphR(): Graph {
  return {
    thesisId: "build_own_realtime_backend_now",
    nodes: [
      { id: "build_own_realtime_backend_now", type: "thesis", label: "Build paid realtime backend now", confidence: 1.0, groups: [{ kind: "AND", childIds: ["team_can_build_operate_infra", "backend_drives_conversion", "differentiates_vs_competitors"] }] },
      { id: "team_can_build_operate_infra", type: "claim", label: "Team can build and operate infra", confidence: 1.0, groups: [{ kind: "AND", childIds: ["team_has_backend_capacity"] }, { kind: "OR", childIds: ["can_reimplement_e2e_collab", "reliability_observability_ready"] }] },
      { id: "backend_drives_conversion", type: "claim", label: "Own backend improves paid conversion", confidence: 1.0, groups: [{ kind: "AND", childIds: ["conversion_is_collab_limited"] }, { kind: "OR", childIds: ["enterprise_auditability_wins", "enterprise_pipeline_real"] }] },
      { id: "differentiates_vs_competitors", type: "claim", label: "Backend keeps pace with rivals", confidence: 1.0, groups: [{ kind: "OR", childIds: ["competitive_urgency_real", "enterprise_auditability_wins"] }] },
      // KEYSTONE — the load-bearing "a 6-person team has spare capacity" assumption (leaf on the spine).
      { id: "team_has_backend_capacity", type: "assumption", label: "Six-person team has spare capacity", confidence: 0.8, groups: [], evidence: { source: "https://www.brex.com/tools/charge-finder/excalidraw", fact: "Bootstrapped open-source company run by a roughly 6-person team in Brno, Czech Republic." } },
      { id: "can_reimplement_e2e_collab", type: "assumption", label: "Can reimplement E2E Socket.IO collab", confidence: 0.95, groups: [], evidence: { source: "excalidraw-app/package.json", fact: "Real-time collaboration: socket.io-client 4.7.2; local-first with idb-keyval and jotai for state." } },
      { id: "reliability_observability_ready", type: "assumption", label: "Reliability and observability adequate", confidence: 0.95, groups: [], evidence: { source: "excalidraw-app/package.json", fact: "Observability: Sentry browser error tracking (@sentry/browser 9.0.1); disabled in Docker builds." } },
      // conversion assumption decomposes into two evidence-support leaves (geometric-mean AND).
      { id: "conversion_is_collab_limited", type: "assumption", label: "Collab quality gates paid conversion", confidence: 1.0, groups: [{ kind: "AND", childIds: ["conv_flat_growth", "conv_gated_by_collab"] }] },
      { id: "conv_flat_growth", type: "assumption", label: "Paid growth is flat", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Excalidraw+ subscription growth has been flat for two quarters." } },
      { id: "conv_gated_by_collab", type: "assumption", label: "Collab is the conversion lever", confidence: 0.9, groups: [], evidence: { source: "https://www.g2.com/products/excalidraw/reviews", fact: "Teams cite live collaboration as the reason they upgrade to Excalidraw+." } },
      { id: "enterprise_auditability_wins", type: "assumption", label: "Own backend enables enterprise auditability", confidence: 0.9, groups: [], evidence: { source: "https://www.g2.com/products/excalidraw/reviews", fact: "SOC 2 Type II compliant with a DPA in place to meet enterprise security/auditability needs." } },
      { id: "enterprise_pipeline_real", type: "assumption", label: "Enterprise pipeline is real", confidence: 0.85, groups: [], evidence: { source: "notes", fact: "Several enterprise trials are waiting on an own-backend compliance story." } },
      { id: "competitive_urgency_real", type: "assumption", label: "tldraw funding pressures collab timeline", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "tldraw just raised a $10M Series A and is shipping a realtime collaboration SDK aggressively." } },
    ],
  };
}

// RAW attack severities. The keystone execution attack is the dominant load; the four
// secondary attacks are milder so the ONE keystone flip is the beat. All within the
// live-plausible [0.12,0.55] band. Numbers vs the depth-robust engine (typed-AND):
//   BASELINE   → 55.40% (standing).
//   RAW        → integrity 18.56%; keystone team_has_backend_capacity HOLDS at 40.0%;
//                differentiates_vs_competitors HOLDS at 90.0%.
//   REWEIGHTED → the pack's ▲execution 0.8 amplifies the keystone attack 0.50→0.70; the
//                keystone CRACKS to 24.0% (FAILS), thesis craters to 9.69%, and
//                differentiates_vs_competitors STILL HOLDS at 90.0% — a partial collapse.
export function fixtureContextAttacksR(): Attack[] {
  return [
    { id: "atk_no_backend_capacity", targetId: "team_has_backend_capacity", category: "execution risk", severity: 0.5, rationale: "A 6-person team with no backend history has no spare capacity; the roadmap meeting in 2 days forces a build commitment they cannot staff." },
    { id: "atk_observability_gap", targetId: "reliability_observability_ready", category: "reliability", severity: 0.12, rationale: "Owning realtime infra raises the reliability burden while observability is only Sentry error tracking." },
    { id: "atk_e2e_reimpl_hard", targetId: "can_reimplement_e2e_collab", category: "technical", severity: 0.12, rationale: "Reimplementing E2E-encrypted Socket.IO collab off excalidraw-room is deep work to scope before the 3-week talk." },
    { id: "atk_conversion_not_collab", targetId: "conv_flat_growth", category: "opportunity cost", severity: 0.35, rationale: "The growth bottleneck is free-to-paid conversion; a backend build competes with that priority without proof collab quality gates conversion." },
    { id: "atk_auditability_overclaim", targetId: "enterprise_auditability_wins", category: "auditability", severity: 0.12, rationale: "SOC 2 / DPA demands need audited controls and process, not merely owning infra." },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCENARIO R · DESIGN — GENERATIVE RIVALS (V6-1)
 * ──────────────────────────────────────────────────────────────────────────
 * Three RIVAL candidate structures for the SAME goal ("win enterprise
 * collaboration revenue without burning the 6-person team"), one per STRATEGY
 * LENS, stress-tested under IDENTICAL grounded load (the R pack's weight
 * adjustments — ▲execution 0.8, ▲reliability/timeline/opp-cost 0.7, …). The pure
 * engine — not the LLM — picks the survivor.
 *
 * PROVENANCE: the live path was run end-to-end (2026-07-04) via scripts/generate-design-r.mjs
 * against the dev server WITH a key — /api/context (live) → /api/design (live). ALL THREE lenses
 * returned source="live": aggressive "SHIP OWNED ENTERPRISE BACKEND NOW", conservative "HARDEN
 * MANAGED INFRA FOR ENTERPRISE FIRST", hybrid "STAGE A ENTERPRISE PILOT ROLLOUT" (10 nodes + 5
 * attacks each). The raw live structures are captured verbatim in scripts/design-r.artifacts.json.
 *
 * The PINNED set below is AUTHORED from that same real Excalidraw material (the ~6-person Brno
 * team, excalidraw-room, Firebase, Socket.IO E2E, Sentry-only observability, tldraw's $10M raise,
 * SOC 2 / DPA — real repo paths + URLs as evidence) and CALIBRATED to the base-engine convention
 * (thesis/claims confidence = 1.0; assumption confidences carry the model's relative skepticism;
 * severities within the [0.15,0.55] live wall band). Calibration is REQUIRED because the live model
 * sets thesis/claim confidences < 1.0, so its deep AND-nested structures integrate to ~0% even RAW
 * under the pure engine — the SAME reason scenario R itself pins thesis/claims to 1.0. Calibrating
 * yields the clean tournament beat the demo needs: ONE survivor, one stressed, one collapsed.
 *
 * VERDICTS (grounded integrity = thesis support ×100 under reweightAttacksByContext
 * with fixtureDecisionContextPackR; depth-robust typed-AND engine; verified by
 * src/ui/design-fixtures.test.ts):
 *   (raw = the candidate's unattacked baseline integrity; grounded = after context-reweighted load)
 *   AGGRESSIVE  "BUILD OWN BACKEND NOW"          raw ≈48.5% → grounded ≈9.5%  ✗ COLLAPSED
 *   CONSERVATIVE"HARDEN MANAGED INFRA FIRST"     raw ≈65.6% → grounded ≈48.5% ✓ STANDS (survivor)
 *   HYBRID      "STAGE A MANAGED-TO-OWN ROLLOUT" raw ≈61.3% → grounded ≈22.8% ⚠ STRESSED
 * ════════════════════════════════════════════════════════════════════════ */

export type DesignLens = "aggressive" | "conservative" | "hybrid";

export interface DesignCandidateFixture {
  lens: DesignLens;
  label: string;
  graph: Graph;
  attacks: Attack[];
}

export function fixtureDesignCandidatesR(): DesignCandidateFixture[] {
  return [
    // ── AGGRESSIVE — bet on speed/upside: build the paid realtime backend now. Rests on the
    // optimistic "a 6-person team has spare capacity" keystone; grounded execution load craters it.
    {
      lens: "aggressive",
      label: "BUILD OWN BACKEND NOW",
      graph: {
        thesisId: "T",
        nodes: [
          { id: "T", type: "thesis", label: "Build own realtime backend now", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_build", "c_convert", "c_compete"] }] },
          { id: "c_build", type: "claim", label: "Team can build and operate it", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_capacity"] }, { kind: "OR", childIds: ["a_e2e", "a_reliab"] }] },
          { id: "c_convert", type: "claim", label: "Own backend lifts paid conversion", confidence: 1.0, groups: [{ kind: "AND", childIds: ["a_conversion"] }, { kind: "OR", childIds: ["a_audit", "a_conv2"] }] },
          { id: "c_compete", type: "claim", label: "Keeps pace with funded rivals", confidence: 1.0, groups: [{ kind: "OR", childIds: ["a_urgency", "a_audit"] }] },
          { id: "k_capacity", type: "assumption", label: "Six-person team has spare capacity", confidence: 0.7, groups: [], evidence: { source: "https://www.brex.com/tools/charge-finder/excalidraw", fact: "Bootstrapped open-source company run by a roughly 6-person team in Brno." } },
          { id: "a_e2e", type: "assumption", label: "Can reimplement E2E Socket.IO collab", confidence: 0.95, groups: [], evidence: { source: "excalidraw-app/package.json", fact: "Real-time collaboration: socket.io-client 4.7.2; E2E-encrypted." } },
          { id: "a_reliab", type: "assumption", label: "Reliability/observability adequate", confidence: 0.95, groups: [], evidence: { source: "excalidraw-app/package.json", fact: "Observability limited to Sentry browser error tracking." } },
          { id: "a_conversion", type: "assumption", label: "Collab quality gates conversion", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Excalidraw+ subscription growth has been flat for two quarters." } },
          { id: "a_audit", type: "assumption", label: "Own backend enables enterprise audit", confidence: 0.9, groups: [], evidence: { source: "https://www.g2.com/products/excalidraw/reviews", fact: "SOC 2 Type II compliant with a DPA in place." } },
          { id: "a_conv2", type: "assumption", label: "Enterprise pipeline is real", confidence: 0.85, groups: [], evidence: { source: "notes", fact: "Several enterprise trials await an own-backend compliance story." } },
          { id: "a_urgency", type: "assumption", label: "tldraw funding pressures timeline", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "tldraw raised a $10M Series A and ships a realtime collab SDK aggressively." } },
        ],
      },
      attacks: [
        { id: "atk_capacity", targetId: "k_capacity", category: "execution risk", severity: 0.5, rationale: "A 6-person team with no backend history has no spare capacity to build/operate own infra before the roadmap meeting." },
        { id: "atk_reliab", targetId: "a_reliab", category: "reliability", severity: 0.15, rationale: "Owning realtime infra raises reliability burden while observability is only Sentry error tracking." },
        { id: "atk_e2e", targetId: "a_e2e", category: "technical", severity: 0.15, rationale: "Reimplementing E2E-encrypted Socket.IO collab off excalidraw-room is deep, unscoped work." },
        { id: "atk_conversion", targetId: "a_conversion", category: "market", severity: 0.15, rationale: "The growth bottleneck is free-to-paid conversion; a backend build competes with it without proof collab gates conversion." },
        { id: "atk_audit", targetId: "a_audit", category: "auditability", severity: 0.15, rationale: "SOC 2 / DPA demands need audited controls and process, not merely owning infra." },
      ],
    },

    // ── CONSERVATIVE — de-risk first: keep the proven managed stack (excalidraw-room + Firebase),
    // harden reliability/compliance incrementally, keep the tiny team on conversion. The SAME
    // grounded context that craters the aggressive plan only mildly stresses this one → it STANDS.
    {
      lens: "conservative",
      label: "HARDEN MANAGED INFRA FIRST",
      graph: {
        thesisId: "T",
        nodes: [
          { id: "T", type: "thesis", label: "Harden managed infra first", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_reliab", "c_focus"] }] },
          { id: "c_reliab", type: "claim", label: "Reliability improves without a rewrite", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_managed"] }, { kind: "OR", childIds: ["a_sentry", "a_firebase"] }] },
          { id: "c_focus", type: "claim", label: "Team stays on paid conversion", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_managed"] }, { kind: "OR", childIds: ["a_roadmap", "a_budget"] }] },
          { id: "k_managed", type: "assumption", label: "Managed stack stays reliable enough", confidence: 0.9, groups: [], evidence: { source: "excalidraw-app/package.json", fact: "Persistence on Firebase Firestore/Storage; realtime via open-source excalidraw-room." } },
          { id: "a_sentry", type: "assumption", label: "Sentry-based ops catch incidents", confidence: 0.85, groups: [], evidence: { source: "excalidraw-app/package.json", fact: "Observability: @sentry/browser error tracking." } },
          { id: "a_firebase", type: "assumption", label: "Firebase SLA covers pilot load", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Firebase Firestore/Storage is a managed, SLA-backed dependency." } },
          { id: "a_roadmap", type: "assumption", label: "Roadmap defers own-backend safely", confidence: 0.85, groups: [], evidence: { source: "notes", fact: "Collaboration roadmap meeting in 2 days sets near-term stance." } },
          { id: "a_budget", type: "assumption", label: "No infra spend frees conversion work", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Bootstrapped; must self-fund any infrastructure investment." } },
        ],
      },
      attacks: [
        { id: "atk_managed", targetId: "k_managed", category: "execution risk", severity: 0.1, rationale: "Leaning on excalidraw-room + Firebase is a bounded, well-understood dependency — not a new build." },
        { id: "atk_sentry", targetId: "a_sentry", category: "reliability", severity: 0.15, rationale: "Sentry-only observability is thin, but Firebase's managed SLA backstops the pilot." },
        { id: "atk_roadmap", targetId: "a_roadmap", category: "timeline", severity: 0.15, rationale: "Deferring the own-backend decision risks ceding momentum, but keeps the 2-day meeting realistic." },
      ],
    },

    // ── HYBRID — stage the bet: pilot an own backend behind excalidraw-room, expand only if the
    // staged milestones prove out. Rests on "the team can staff a staged pilot" — grounded execution
    // + timeline load stresses it into the middle band (STANDS neither cleanly nor collapses).
    {
      lens: "hybrid",
      label: "STAGE A MANAGED-TO-OWN ROLLOUT",
      graph: {
        thesisId: "T",
        nodes: [
          { id: "T", type: "thesis", label: "Stage a managed-to-own rollout", confidence: 1.0, groups: [{ kind: "AND", childIds: ["c_pilot", "c_value"] }] },
          { id: "c_pilot", type: "claim", label: "A staged pilot is deliverable", confidence: 1.0, groups: [{ kind: "AND", childIds: ["k_staged", "a_scope"] }] },
          { id: "c_value", type: "claim", label: "The pilot proves enterprise value", confidence: 1.0, groups: [{ kind: "AND", childIds: ["a_signal"] }, { kind: "OR", childIds: ["a_audit_pilot"] }] },
          { id: "k_staged", type: "assumption", label: "Team can staff a staged pilot", confidence: 0.8, groups: [], evidence: { source: "https://www.brex.com/tools/charge-finder/excalidraw", fact: "~6-person team; a staged pilot still competes for the same scarce capacity." } },
          { id: "a_scope", type: "assumption", label: "Pilot scope stays small by meeting", confidence: 0.9, groups: [], evidence: { source: "notes", fact: "Roadmap meeting in 2 days forces a narrow near-term scope." } },
          { id: "a_signal", type: "assumption", label: "Pilot yields a conversion signal", confidence: 0.85, groups: [], evidence: { source: "notes", fact: "Excalidraw+ conversion has been flat; a pilot must show it moves." } },
          { id: "a_audit_pilot", type: "assumption", label: "Pilot satisfies enterprise audit", confidence: 0.85, groups: [], evidence: { source: "https://www.g2.com/products/excalidraw/reviews", fact: "SOC 2 Type II + DPA expectations apply to any own-infra pilot." } },
        ],
      },
      attacks: [
        { id: "atk_staged", targetId: "k_staged", category: "execution risk", severity: 0.4, rationale: "Even a staged pilot pulls the tiny team off conversion; capacity is the binding constraint." },
        { id: "atk_scope", targetId: "a_scope", category: "timeline", severity: 0.15, rationale: "Scope tends to creep once an own-backend pilot starts, past the 2-day meeting's narrow mandate." },
        { id: "atk_signal", targetId: "a_signal", category: "market", severity: 0.18, rationale: "A pilot may not produce a clean conversion signal fast enough to justify further build." },
        { id: "atk_audit_pilot", targetId: "a_audit_pilot", category: "auditability", severity: 0.18, rationale: "SOC 2 / DPA controls are non-trivial even for a limited pilot." },
      ],
    },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCENARIO REGISTRY — one place the UI + fixture chain agree on scenarios.
 * R (real)    = the live-generated Excalidraw decision that COLLAPSES under context.
 * A (default) = the hero migrate decision that COLLAPSES under context.
 * B           = the reinforce decision that HOLDS under the same context.
 * ════════════════════════════════════════════════════════════════════════ */
export type ScenarioId = "A" | "B" | "R";

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  input: ContextInput;
}

export const SCENARIOS: Record<ScenarioId, ScenarioMeta> = {
  R: { id: "R", label: "R — EXCALIDRAW · REAL", input: REAL_CONTEXT_INPUT },
  A: { id: "A", label: "A — Migrate before pilot (collapses)", input: HERO_CONTEXT_INPUT },
  B: { id: "B", label: "B — Reinforce first (holds)", input: REINFORCE_CONTEXT_INPUT },
};

export function isScenarioId(v: unknown): v is ScenarioId {
  return v === "A" || v === "B" || v === "R";
}

