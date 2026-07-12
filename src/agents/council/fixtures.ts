// Contextual analysis council — offline `fixtureCouncil` (Phase 3, Task 1).
//
// Hand-authored, deterministic council results for the three demo scenarios. Node ids
// and finding ids below are cross-checked against `src/context/fixtures.ts`
// (`fixtureContextGraph`/`fixtureContextGraphB`/`fixtureContextGraphR` for graph node
// ids; `fixtureCompanyContext*`/`fixtureDecisionContextPack*` for con_*/risk_*/obj_*
// finding ids). No Date/Math.random — every result is a plain literal.
import type { CouncilResult } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO A — "Migrate to microservices" (hero). Topological keystone is
// `k_credible`. Under context, the buyer's REAL requirement is auditability, not the
// staged-migration story — so the council's contextual keystone is `a_audit`, distinct
// from the topological keystone. This is the "context changes the spine" demo beat.
// ─────────────────────────────────────────────────────────────────────────────
function councilA(): CouncilResult {
  return {
    nodeWeights: [
      {
        nodeId: "k_credible",
        contextWeight: 0.85,
        rationale:
          "Tomorrow's enterprise meeting makes 'can we explain a credible staged plan' an immediate, high-stakes claim.",
        evidenceRefs: ["con_time", "risk_exec"],
      },
      {
        nodeId: "a_audit",
        contextWeight: 0.95,
        rationale:
          "The buyer sells into regulated fintech and explicitly requires audit trails — this is the real load-bearing belief, not architecture purity.",
        evidenceRefs: ["con_reg", "obj_win"],
      },
      {
        nodeId: "a_obs",
        contextWeight: 0.55,
        rationale:
          "Limited observability is a known technical risk for a distributed rollout the buyer will probe.",
        evidenceRefs: ["risk_tech"],
      },
      {
        nodeId: "a_bound",
        contextWeight: 0.3,
        rationale:
          "Boundary cleanliness matters for ROI but is not what tomorrow's meeting will interrogate.",
        evidenceRefs: ["con_time"],
      },
      {
        nodeId: "a_load",
        contextWeight: 0.15,
        rationale:
          "Load unevenness is a real engineering concern but is not deadline-relevant to the buyer conversation.",
        evidenceRefs: ["risk_tech"],
      },
    ],
    contextKeystoneId: "a_audit",
    contextualAttacks: [
      {
        id: "ctx_atk_credible",
        targetId: "k_credible",
        category: "execution risk",
        severity: 0.5,
        rationale:
          "With the enterprise meeting tomorrow, there is no time left to demonstrate a safe staged migration end-to-end.",
      },
      {
        id: "ctx_atk_audit",
        targetId: "a_audit",
        category: "auditability",
        severity: 0.45,
        rationale:
          "Regulated fintech buyers require proven audit trails across services; that proof does not exist yet, and the meeting will ask for it directly.",
      },
      {
        id: "ctx_atk_obs",
        targetId: "a_obs",
        category: "reliability",
        severity: 0.3,
        rationale:
          "Limited observability means a distributed rollout's failure modes would be invisible right when reliability is under the microscope.",
      },
    ],
    hiddenAssumptions: [
      {
        label: "The buyer conflates 'new architecture' with 'more reliable'",
        why: "The plan assumes microservices read as progress toward reliability, but the buyer's real ask is proven auditability and uptime, which architecture change does not by itself deliver.",
        evidenceRefs: ["con_reg", "risk_exec"],
      },
      {
        label: "A credible-sounding plan will be treated as equivalent to a proven one",
        why: "Tomorrow's meeting rewards a story that sounds safe, but the team has no tracing or metrics evidence to back a staged-migration claim under scrutiny.",
        evidenceRefs: ["con_time"],
      },
    ],
    fractureNarrative:
      "Under tomorrow's meeting deadline, the plan doesn't crack on migration feasibility — it cracks on auditability, the buyer's actual unstated requirement, which was never proven.",
    grounded: true,
    source: "fixture",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO B — "Reinforce before pilot" (keep monolith, hire 2 SREs). The identical
// meeting-tomorrow context stresses this plan far less because it targets the buyer's
// real ask (operational reliability) directly. Contextual keystone matches the
// topological keystone `k_sre` — the council confirms the structure's own read here.
// ─────────────────────────────────────────────────────────────────────────────
function councilB(): CouncilResult {
  return {
    nodeWeights: [
      {
        nodeId: "k_sre",
        contextWeight: 0.8,
        rationale:
          "Hiring the two SREs before the pilot is the single lever the buyer's reliability ask actually depends on.",
        evidenceRefs: ["con_time", "risk_hire"],
      },
      {
        nodeId: "a_oncall",
        contextWeight: 0.55,
        rationale:
          "A viable on-call rotation is what turns hardening into demonstrable reliability during the pilot window.",
        evidenceRefs: ["risk_obs"],
      },
      {
        nodeId: "a_runbook",
        contextWeight: 0.4,
        rationale:
          "Runbooks matter for the auditability story the regulated buyer expects, though less urgently than staffing.",
        evidenceRefs: ["con_reg"],
      },
      {
        nodeId: "a_budget",
        contextWeight: 0.25,
        rationale:
          "Budget approval for two hires is a modest, already-scoped risk relative to the pilot's value.",
        evidenceRefs: ["obj_pilot"],
      },
    ],
    contextKeystoneId: "k_sre",
    contextualAttacks: [
      {
        id: "ctx_atk_sre",
        targetId: "k_sre",
        category: "execution risk",
        severity: 0.3,
        rationale:
          "Sourcing and onboarding two SREs before the pilot window is real delivery risk, sharpened by tomorrow's meeting, but it is bounded and already understood.",
      },
      {
        id: "ctx_atk_oncall",
        targetId: "a_oncall",
        category: "reliability",
        severity: 0.35,
        rationale:
          "A thin on-call rotation on the current team is stretched right when the buyer will be probing reliability directly.",
      },
      {
        id: "ctx_atk_budget",
        targetId: "a_budget",
        category: "execution risk",
        severity: 0.2,
        rationale:
          "Two headcount is a modest, already-scoped spend, but any hiring delay compresses the pre-pilot hardening window.",
      },
    ],
    hiddenAssumptions: [
      {
        label: "Two SRE hires can be sourced and onboarded before the pilot window closes",
        why: "The plan's reliability story depends on the hires landing in time; a slow hiring market would silently blow the pilot deadline.",
        evidenceRefs: ["risk_hire", "con_time"],
      },
      {
        label: "Runbooks alone substitute for battle-tested incident response",
        why: "The buyer is judging demonstrated reliability, not documentation; untested runbooks may not hold up under a real incident during the pilot.",
        evidenceRefs: ["risk_obs"],
      },
    ],
    fractureNarrative:
      "The reinforcement plan holds under tomorrow's meeting pressure because it targets the buyer's real ask directly, so the SRE keystone absorbs the load instead of cracking under it.",
    grounded: true,
    source: "fixture",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO R — "Build Excalidraw's own realtime backend now." Contextual keystone
// matches the topological keystone `team_has_backend_capacity` — the live-grounded
// read agrees with the structural one: a 6-person team's spare capacity is the real
// constraint, not technical feasibility.
// ─────────────────────────────────────────────────────────────────────────────
function councilR(): CouncilResult {
  return {
    nodeWeights: [
      {
        nodeId: "team_has_backend_capacity",
        contextWeight: 0.9,
        rationale:
          "A roadmap meeting in 2 days forces a near-term commitment, and the 6-person team has no prior backend history to draw spare capacity from.",
        evidenceRefs: ["con-team", "risk-capacity"],
      },
      {
        nodeId: "conversion_is_collab_limited",
        contextWeight: 0.6,
        rationale:
          "The stated growth bottleneck is free-to-paid conversion, so a backend build is only justified if collab quality truly gates it.",
        evidenceRefs: ["obj-convert", "risk-opp-cost"],
      },
      {
        nodeId: "enterprise_auditability_wins",
        contextWeight: 0.45,
        rationale:
          "SOC 2 / DPA expectations from enterprise buyers make auditability a real but secondary driver behind the capacity question.",
        evidenceRefs: ["con-regulatory", "obj-enterprise"],
      },
      {
        nodeId: "competitive_urgency_real",
        contextWeight: 0.35,
        rationale:
          "tldraw's funding adds urgency but does not itself change whether the team can staff the build.",
        evidenceRefs: ["risk-competitor", "con-market"],
      },
    ],
    contextKeystoneId: "team_has_backend_capacity",
    contextualAttacks: [
      {
        id: "ctx_atk_capacity",
        targetId: "team_has_backend_capacity",
        category: "execution risk",
        severity: 0.5,
        rationale:
          "A 6-person team with no backend history has no spare capacity, and the roadmap meeting in 2 days forces a build commitment they cannot staff.",
      },
      {
        id: "ctx_atk_conversion",
        targetId: "conversion_is_collab_limited",
        category: "opportunity cost",
        severity: 0.35,
        rationale:
          "The real growth bottleneck is free-to-paid conversion; committing scarce team time to a backend build competes directly with that priority.",
      },
      {
        id: "ctx_atk_reliability",
        targetId: "reliability_observability_ready",
        category: "reliability",
        severity: 0.2,
        rationale:
          "Owning realtime infra raises the reliability burden while observability is limited to Sentry error tracking alone.",
      },
    ],
    hiddenAssumptions: [
      {
        label: "Building an own backend needs no hires beyond the current 6 people",
        why: "The plan implicitly assumes the existing team can absorb a new, unfamiliar infra workload on top of its current roadmap without additional capacity.",
        evidenceRefs: ["con-team", "risk-capacity"],
      },
      {
        label: "Collaboration quality is the actual conversion lever, not price or breadth",
        why: "The conversion thesis assumes upgrading collab drives paid subscriptions, but flat growth could equally stem from pricing or missing enterprise features.",
        evidenceRefs: ["obj-convert", "risk-opp-cost"],
      },
    ],
    fractureNarrative:
      "With the roadmap meeting only 2 days away, the plan doesn't crack on technical feasibility — it cracks on whether a 6-person team actually has the spare capacity to build and operate what it's committing to.",
    grounded: true,
    source: "fixture",
  };
}

/**
 * Hand-authored, deterministic council result for a demo scenario. No live model
 * calls — this is the offline fallback so the contextual-analysis feature demos
 * without an API key.
 */
export function fixtureCouncil(scenario: "A" | "B" | "R"): CouncilResult {
  switch (scenario) {
    case "A":
      return councilA();
    case "B":
      return councilB();
    case "R":
      return councilR();
  }
}
