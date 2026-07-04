// Scripted offline fixtures per kind: a few status lines, several findings, and a
// terminal done — plus the GatherFindings they resolve to. Timestamps are constant
// placeholders (never Date.now()); replayFixture re-stamps each event via the
// caller-supplied `now`, so the route controls provenance timestamps.
import type { AgentEvent, Emit, GatherFindings, GatherKind, Now } from "./types";

const T0 = "1970-01-01T00:00:00.000Z"; // placeholder; re-stamped on replay

export interface KindFixture {
  events: AgentEvent[];
  findings: GatherFindings;
}

/* ---------------- TECHNICAL (source = file paths) ---------------- */

const TECHNICAL_FINDINGS: GatherFindings = {
  kind: "technical",
  summary:
    "FastAPI monolith (Python). Limited observability and no dedicated platform engineer. " +
    "Dockerfile present (single service); pytest suite under tests/; GitHub Actions CI runs lint + pytest. " +
    "A distributed rewrite would raise operational complexity without a platform team to run it.",
  facts: [
    {
      label: "Framework",
      value: "FastAPI monolith (Python)",
      source: "pyproject.toml",
      detail:
        "A single FastAPI application serving all domains from one process — no service boundaries exist yet, so a distributed rewrite starts from zero.",
      specifics: ["FastAPI", "Python", "single deployable"],
    },
    {
      label: "Dependencies",
      value: "fastapi, uvicorn, sqlalchemy, pytest",
      source: "pyproject.toml",
      detail:
        "The dependency set is a conventional sync web stack with no message bus, service mesh, or RPC framework — the plumbing a services split would require is absent.",
      specifics: ["fastapi", "uvicorn", "sqlalchemy", "pytest", "no message broker"],
    },
    {
      label: "Containerization",
      value: "Dockerfile present (single service)",
      source: "Dockerfile",
      detail:
        "One Dockerfile builds the whole app as a single image; there is no per-service build or orchestration manifest.",
      specifics: ["1 Dockerfile", "no k8s/compose manifests"],
    },
    {
      label: "CI",
      value: "GitHub Actions: lint + pytest on push",
      source: ".github/workflows/ci.yml",
      detail:
        "CI runs lint and the pytest suite on every push, but has no deploy, integration, or load-test stage — release maturity is basic.",
      specifics: ["GitHub Actions", "lint + pytest", "no deploy stage"],
    },
    {
      label: "Tests",
      value: "pytest suite under tests/",
      source: "tests/",
      detail:
        "A unit-level pytest suite exists under tests/, but there is no end-to-end or contract-test coverage for cross-service calls.",
      specifics: ["pytest", "unit-level only"],
    },
    {
      label: "Observability",
      value: "No tracing/metrics wiring found",
      source: "src/",
      detail:
        "No OpenTelemetry, Prometheus, or structured-logging wiring was found in src/ — distributed operations would be effectively blind on day one.",
      specifics: ["no tracing", "no metrics", "no dashboards"],
    },
    {
      label: "Team signal",
      value: "No platform/infra owner in CODEOWNERS",
      source: "src/",
      detail:
        "CODEOWNERS lists no platform or infrastructure owner, signalling there is no dedicated team to run a distributed system if one were built.",
      specifics: ["0 platform owners", "no SRE function"],
    },
  ],
};

const TECHNICAL_FIXTURE: KindFixture = {
  findings: TECHNICAL_FINDINGS,
  events: [
    { type: "status", message: "Cloning repository (shallow, depth 1)…", ts: T0 },
    { type: "status", message: "Building repository digest…", ts: T0 },
    { type: "finding", finding: TECHNICAL_FINDINGS.facts[0], ts: T0 },
    { type: "finding", finding: TECHNICAL_FINDINGS.facts[2], ts: T0 },
    { type: "status", message: "Exploring with read-only tools (list_dir / read_file / grep)…", ts: T0 },
    { type: "finding", finding: TECHNICAL_FINDINGS.facts[3], ts: T0 },
    { type: "finding", finding: TECHNICAL_FINDINGS.facts[4], ts: T0 },
    { type: "finding", finding: TECHNICAL_FINDINGS.facts[5], ts: T0 },
    { type: "status", message: "Summarizing technical context…", ts: T0 },
    { type: "done", findings: TECHNICAL_FINDINGS, source: "fixture", ts: T0 },
  ],
};

/* ---------------- BUSINESS (source = urls) ---------------- */

const BUSINESS_FINDINGS: GatherFindings = {
  kind: "business",
  summary:
    "Enterprise fintech selling into regulated finance teams. Enterprise onboarding speed is the main growth " +
    "bottleneck. Competitors include Ledgerline (incumbent) and Northgate (fast-growing challenger). " +
    "Buyers demand auditability and reliability before they commit.",
  facts: [
    {
      label: "Industry",
      value: "Enterprise fintech (regulated finance)",
      source: "https://company.example.com/about",
      detail:
        "The company sells compliance-sensitive financial software into regulated finance teams, so reliability and audit posture are gating purchase criteria.",
      specifics: ["regulated finance", "enterprise segment"],
    },
    {
      label: "Segment",
      value: "Sells to regulated fintech and enterprise finance teams",
      source: "https://company.example.com",
      detail:
        "Buyers are enterprise finance and fintech teams with procurement and security review gates, lengthening the sales cycle.",
      specifics: ["enterprise finance buyers", "security-gated procurement"],
    },
    {
      label: "Growth bottleneck",
      value: "Enterprise onboarding speed",
      source: "https://company.example.com/customers",
      detail:
        "Slow enterprise onboarding is the stated primary constraint on growth — deals stall in implementation, not in the funnel.",
      specifics: ["onboarding is #1 bottleneck"],
    },
    {
      label: "Competitor",
      value: "Ledgerline — incumbent platform",
      source: "https://ledgerline.example.com",
      detail:
        "Ledgerline is the entrenched incumbent with deep enterprise install base; displacing it demands a clear reliability/audit edge.",
      specifics: ["incumbent", "large install base"],
    },
    {
      label: "Competitor",
      value: "Northgate — fast-growing challenger",
      source: "https://northgate.example.com",
      detail:
        "Northgate is a fast-growing challenger competing on speed of delivery, pressuring the company's own timeline to differentiate.",
      specifics: ["fast-growing challenger", "competes on delivery speed"],
    },
    {
      label: "Buyer requirements",
      value: "Auditability and reliability required to close",
      source: "https://company.example.com/security",
      detail:
        "Enterprise buyers require demonstrable auditability and reliability (e.g. SOC 2, uptime evidence) before they commit — these are hard close gates, not nice-to-haves.",
      specifics: ["SOC 2 expected", "audit trail required", "uptime SLAs"],
    },
  ],
};

const BUSINESS_FIXTURE: KindFixture = {
  findings: BUSINESS_FINDINGS,
  events: [
    { type: "status", message: "Searching the web for the company…", ts: T0 },
    { type: "status", message: "Fetching website…", ts: T0 },
    { type: "finding", finding: BUSINESS_FINDINGS.facts[0], ts: T0 },
    { type: "finding", finding: BUSINESS_FINDINGS.facts[2], ts: T0 },
    { type: "status", message: "Analyzing competitors…", ts: T0 },
    { type: "finding", finding: BUSINESS_FINDINGS.facts[3], ts: T0 },
    { type: "finding", finding: BUSINESS_FINDINGS.facts[4], ts: T0 },
    { type: "finding", finding: BUSINESS_FINDINGS.facts[5], ts: T0 },
    { type: "status", message: "Summarizing business context…", ts: T0 },
    { type: "done", findings: BUSINESS_FINDINGS, source: "fixture", ts: T0 },
  ],
};

/* ---------------- TEMPORAL (source = notes) ---------------- */

const TEMPORAL_FINDINGS: GatherFindings = {
  kind: "temporal",
  summary:
    "Major enterprise customer meeting tomorrow focused on reliability, auditability, and implementation timeline. " +
    "A credible near-term technical plan is needed before the meeting; near-term urgency is high.",
  facts: [
    {
      label: "Upcoming meeting",
      value: "Enterprise customer meeting — tomorrow",
      source: "notes",
      detail:
        "A major enterprise customer meeting is scheduled for tomorrow; the decision's near-term credibility will be judged there.",
      specifics: ["tomorrow", "enterprise customer"],
    },
    {
      label: "Meeting focus",
      value: "Reliability, auditability, implementation timeline",
      source: "notes",
      detail:
        "The agenda centres on reliability, auditability, and the implementation timeline — precisely the categories a distributed rewrite puts at risk.",
      specifics: ["reliability", "auditability", "implementation timeline"],
    },
    {
      label: "Deadline",
      value: "Credible near-term technical plan by the meeting",
      source: "notes",
      detail:
        "A credible, explainable near-term technical plan must be ready by the meeting — there is no slack to defer the story.",
      specifics: ["due by tomorrow's meeting"],
    },
    {
      label: "Urgency",
      value: "High (near-term pressure ~0.85)",
      source: "notes",
      detail:
        "Overall near-term time pressure is high (~0.85), which raises the weight on execution and timeline risk categories.",
      specifics: ["urgency ~0.85"],
    },
    {
      label: "Follow-up",
      value: "Security & reliability review scheduled next week",
      source: "notes",
      detail:
        "A security and reliability review follows next week, so any commitments made tomorrow will be scrutinised within days.",
      specifics: ["next week", "security & reliability review"],
    },
  ],
};

const TEMPORAL_FIXTURE: KindFixture = {
  findings: TEMPORAL_FINDINGS,
  events: [
    { type: "status", message: "Parsing agenda / notes…", ts: T0 },
    { type: "status", message: "Extracting upcoming events…", ts: T0 },
    { type: "finding", finding: TEMPORAL_FINDINGS.facts[0], ts: T0 },
    { type: "finding", finding: TEMPORAL_FINDINGS.facts[1], ts: T0 },
    { type: "status", message: "Extracting deadlines and urgency…", ts: T0 },
    { type: "finding", finding: TEMPORAL_FINDINGS.facts[2], ts: T0 },
    { type: "finding", finding: TEMPORAL_FINDINGS.facts[3], ts: T0 },
    { type: "finding", finding: TEMPORAL_FINDINGS.facts[4], ts: T0 },
    { type: "status", message: "Summarizing temporal context…", ts: T0 },
    { type: "done", findings: TEMPORAL_FINDINGS, source: "fixture", ts: T0 },
  ],
};

export const FIXTURES: Record<GatherKind, KindFixture> = {
  technical: TECHNICAL_FIXTURE,
  business: BUSINESS_FIXTURE,
  temporal: TEMPORAL_FIXTURE,
};

/** Re-stamp an event's ts with the caller-supplied clock (keeps the discriminated union intact). */
function stamp(e: AgentEvent, ts: string): AgentEvent {
  switch (e.type) {
    case "status":
      return { type: "status", message: e.message, ts };
    case "finding":
      return { type: "finding", finding: e.finding, ts };
    case "error":
      return { type: "error", message: e.message, ts };
    case "done":
      return { type: "done", findings: e.findings, source: e.source, ts };
  }
}

/** Replay a kind's scripted events (re-stamped via `now`) and return its findings. */
export function replayFixture(kind: GatherKind, emit: Emit, now: Now): GatherFindings {
  const fx = FIXTURES[kind];
  for (const e of fx.events) emit(stamp(e, now()));
  return fx.findings;
}
