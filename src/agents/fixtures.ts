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
    { label: "Framework", value: "FastAPI monolith (Python)", source: "pyproject.toml" },
    { label: "Dependencies", value: "fastapi, uvicorn, sqlalchemy, pytest", source: "pyproject.toml" },
    { label: "Containerization", value: "Dockerfile present (single service)", source: "Dockerfile" },
    { label: "CI", value: "GitHub Actions: lint + pytest on push", source: ".github/workflows/ci.yml" },
    { label: "Tests", value: "pytest suite under tests/", source: "tests/" },
    { label: "Observability", value: "No tracing/metrics wiring found", source: "src/" },
    { label: "Team signal", value: "No platform/infra owner in CODEOWNERS", source: "src/" },
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
    { label: "Industry", value: "Enterprise fintech (regulated finance)", source: "https://company.example.com/about" },
    { label: "Segment", value: "Sells to regulated fintech and enterprise finance teams", source: "https://company.example.com" },
    { label: "Growth bottleneck", value: "Enterprise onboarding speed", source: "https://company.example.com/customers" },
    { label: "Competitor", value: "Ledgerline — incumbent platform", source: "https://ledgerline.example.com" },
    { label: "Competitor", value: "Northgate — fast-growing challenger", source: "https://northgate.example.com" },
    { label: "Buyer requirements", value: "Auditability and reliability required to close", source: "https://company.example.com/security" },
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
    { label: "Upcoming meeting", value: "Enterprise customer meeting — tomorrow", source: "notes" },
    { label: "Meeting focus", value: "Reliability, auditability, implementation timeline", source: "notes" },
    { label: "Deadline", value: "Credible near-term technical plan by the meeting", source: "notes" },
    { label: "Urgency", value: "High (near-term pressure ~0.85)", source: "notes" },
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
