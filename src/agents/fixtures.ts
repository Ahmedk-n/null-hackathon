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
    "FastAPI monolith (Python) — 62 deps, no message bus. Single-stage Dockerfile, one image; GitHub " +
    "Actions runs ruff + pytest (38 test files, unit-only, no deploy stage); no OpenTelemetry/Prometheus " +
    "wiring anywhere in src/; CODEOWNERS names one backend team and no platform owner. A distributed " +
    "rewrite would add operational complexity the team has no observability or SRE function to run.",
  facts: [
    {
      label: "Framework",
      value: "FastAPI monolith (Python)",
      source: "pyproject.toml",
      category: "stack",
      sourceExcerpt: `dependencies = ["fastapi>=0.110", "uvicorn[standard]>=0.29", "sqlalchemy>=2.0"]`,
      quantities: [
        { metric: "fastapi", value: "0.110" },
        { metric: "uvicorn", value: "0.29" },
        { metric: "sqlalchemy", value: "2.0" },
      ],
      entities: ["FastAPI", "Uvicorn", "SQLAlchemy", "Python"],
      implication:
        "One FastAPI process serves every domain — a services split starts from zero boundaries, so the rewrite's true cost is understated.",
      confidence: 0.95,
      detail:
        "A single FastAPI application serving all domains from one process — no service boundaries exist yet, so a distributed rewrite starts from zero.",
      specifics: ["FastAPI 0.110", "uvicorn 0.29", "sqlalchemy 2.0", "single deployable"],
    },
    {
      label: "Dependencies",
      value: "62 deps, no message bus or RPC framework",
      source: "poetry.lock",
      category: "stack",
      sourceExcerpt: `name = "sqlalchemy"\nversion = "2.0.30"`,
      quantities: [
        { metric: "total dependencies", value: "62" },
        { metric: "message brokers", value: "0" },
      ],
      entities: ["Poetry", "SQLAlchemy 2.0.30"],
      implication:
        "No broker, service mesh, or RPC plumbing is present — the infrastructure a distributed split needs is net-new work.",
      confidence: 0.9,
      detail:
        "The dependency set is a conventional sync web stack with no message bus, service mesh, or RPC framework — the plumbing a services split would require is absent.",
      specifics: ["62 deps", "no message broker", "sqlalchemy 2.0.30"],
    },
    {
      label: "Containerization",
      value: "Single-stage Dockerfile, one image",
      source: "Dockerfile",
      category: "infra",
      sourceExcerpt: `FROM python:3.11-slim\nCOPY . /app\nCMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]`,
      quantities: [
        { metric: "Dockerfiles", value: "1" },
        { metric: "orchestration manifests", value: "0" },
      ],
      entities: ["Docker", "python:3.11-slim"],
      implication:
        "One image builds the whole app; there is no per-service build or k8s/compose manifest to run many services.",
      confidence: 0.9,
      detail:
        "One Dockerfile builds the whole app as a single image; there is no per-service build or orchestration manifest.",
      specifics: ["1 Dockerfile", "no k8s/compose manifests"],
    },
    {
      label: "CI",
      value: "GitHub Actions: ruff + pytest, no deploy stage",
      source: ".github/workflows/ci.yml",
      category: "ci",
      sourceExcerpt: `      - run: ruff check .\n      - run: pytest -q`,
      quantities: [
        { metric: "CI steps", value: "2" },
        { metric: "deploy stages", value: "0" },
      ],
      entities: ["GitHub Actions", "ruff", "pytest"],
      implication:
        "CI runs lint + unit tests on push but has no deploy, integration, or load-test stage — release maturity is basic.",
      confidence: 0.85,
      detail:
        "CI runs lint and the pytest suite on every push, but has no deploy, integration, or load-test stage — release maturity is basic.",
      specifics: ["GitHub Actions", "ruff + pytest", "no deploy stage"],
    },
    {
      label: "Tests",
      value: "pytest suite, 38 test files, unit-only",
      source: "tests/",
      category: "tests",
      sourceExcerpt: `def test_ledger_roundtrip(client):\n    resp = client.post("/ledger", json=SAMPLE)`,
      quantities: [
        { metric: "test files", value: "38" },
        { metric: "contract/e2e tests", value: "0" },
      ],
      entities: ["pytest"],
      implication:
        "Coverage is unit-level with zero cross-service contract tests — a split would ship without safety nets on the new boundaries.",
      confidence: 0.8,
      detail:
        "A unit-level pytest suite exists under tests/, but there is no end-to-end or contract-test coverage for cross-service calls.",
      specifics: ["38 test files", "unit-level only", "no contract tests"],
    },
    {
      label: "Observability",
      value: "No tracing/metrics wiring found",
      source: "src/",
      category: "observability",
      sourceExcerpt: `$ grep -r "opentelemetry|prometheus|structlog" src/\nNo matches.`,
      quantities: [
        { metric: "tracing libs", value: "0" },
        { metric: "metrics exporters", value: "0" },
      ],
      entities: ["OpenTelemetry", "Prometheus", "structlog"],
      implication:
        "grep for opentelemetry/prometheus/structlog returned nothing — distributed operations would be blind on day one.",
      confidence: 0.85,
      detail:
        "No OpenTelemetry, Prometheus, or structured-logging wiring was found in src/ — distributed operations would be effectively blind on day one.",
      specifics: ["no tracing", "no metrics", "no dashboards"],
    },
    {
      label: "Team signal",
      value: "No platform/infra owner in CODEOWNERS",
      source: "CODEOWNERS",
      category: "team",
      sourceExcerpt: `*       @acme/backend`,
      quantities: [
        { metric: "platform owners", value: "0" },
        { metric: "code-owner teams", value: "1" },
      ],
      entities: ["@acme/backend"],
      implication:
        "One backend team owns everything; there is no SRE or platform function to run a distributed system if one were built.",
      confidence: 0.8,
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
    "Series B enterprise fintech ($45M raised, Mar 2025) selling audit-grade infrastructure into regulated " +
    "finance teams. Median enterprise go-live is 11 weeks — the stated #1 growth blocker. Competitors: " +
    "Ledgerline (incumbent, 400+ customers since 2014) and Northgate (challenger, 3x YoY, ships weekly). " +
    "Buyers gate on SOC 2 Type II and a 99.95% uptime SLA before committing.",
  facts: [
    {
      label: "Industry",
      value: "Enterprise fintech (regulated finance)",
      source: "https://company.example.com/about",
      category: "market",
      sourceExcerpt: `"We build audit-grade financial infrastructure for regulated finance teams."`,
      entities: ["fintech", "regulated finance"],
      implication:
        "Compliance-sensitive buyers make reliability and audit posture gating purchase criteria — not nice-to-haves.",
      confidence: 0.9,
      detail:
        "The company sells compliance-sensitive financial software into regulated finance teams, so reliability and audit posture are gating purchase criteria.",
      specifics: ["regulated finance", "enterprise segment"],
    },
    {
      label: "Stage / funding",
      value: "Series B — $45M raised (Mar 2025)",
      source: "https://techcrunch.example.com/company-series-b",
      category: "funding",
      sourceExcerpt: `"the company closed a $45M Series B led by Meridian Ventures in March 2025."`,
      quantities: [
        { metric: "Series B", value: "45", unit: "$M" },
        { metric: "total raised", value: "63", unit: "$M" },
      ],
      entities: ["Meridian Ventures"],
      dateISO: "2025-03-01",
      implication:
        "A fresh $45M round raises the stakes on hitting enterprise milestones this year — timeline risk carries more weight.",
      confidence: 0.85,
      detail:
        "A $45M Series B closed in March 2025 (led by Meridian Ventures); ~$63M raised in total, so enterprise-milestone pressure is high.",
      specifics: ["$45M Series B", "$63M total", "Meridian Ventures", "Mar 2025"],
    },
    {
      label: "Growth bottleneck",
      value: "Enterprise onboarding speed (11-week go-live)",
      source: "https://company.example.com/customers",
      category: "growth",
      sourceExcerpt: `"median enterprise go-live is 11 weeks — our most-reported blocker."`,
      quantities: [{ metric: "median go-live", value: "11", unit: "weeks" }],
      implication:
        "Deals stall in implementation, not the funnel — anything that lengthens delivery (a risky rewrite) directly threatens revenue.",
      confidence: 0.85,
      detail:
        "Slow enterprise onboarding is the stated primary constraint on growth — deals stall in implementation, not in the funnel.",
      specifics: ["11-week median go-live", "onboarding is #1 bottleneck"],
    },
    {
      label: "Competitor",
      value: "Ledgerline — incumbent platform",
      source: "https://ledgerline.example.com/customers",
      category: "competitor",
      sourceExcerpt: `"Trusted by 400+ enterprise finance teams since 2014."`,
      quantities: [
        { metric: "enterprise customers", value: "400", unit: "+" },
        { metric: "founded", value: "2014" },
      ],
      entities: ["Ledgerline"],
      implication:
        "An entrenched incumbent with a deep install base — displacing it needs a clear reliability/audit edge, not feature parity.",
      confidence: 0.8,
      detail:
        "Ledgerline is the entrenched incumbent with a deep enterprise install base; displacing it demands a clear reliability/audit edge.",
      specifics: ["400+ customers", "founded 2014", "incumbent"],
    },
    {
      label: "Competitor",
      value: "Northgate — fast-growing challenger",
      source: "https://northgate.example.com/about",
      category: "competitor",
      sourceExcerpt: `"3x YoY growth, and we ship to production every week."`,
      quantities: [{ metric: "YoY growth", value: "3", unit: "x" }],
      entities: ["Northgate"],
      implication:
        "A challenger competing on delivery speed pressures the company's own timeline to differentiate.",
      confidence: 0.75,
      detail:
        "Northgate is a fast-growing challenger competing on speed of delivery, pressuring the company's own timeline to differentiate.",
      specifics: ["3x YoY growth", "ships weekly", "fast-growing challenger"],
    },
    {
      label: "Buyer requirements",
      value: "SOC 2 Type II + 99.95% uptime to close",
      source: "https://company.example.com/security",
      category: "constraint",
      sourceExcerpt: `"SOC 2 Type II certified; 99.95% uptime SLA on all enterprise plans."`,
      quantities: [{ metric: "uptime SLA", value: "99.95", unit: "%" }],
      entities: ["SOC 2 Type II"],
      implication:
        "Enterprise buyers gate on demonstrable audit trail + uptime — a rewrite that risks either is a direct revenue threat.",
      confidence: 0.85,
      detail:
        "Enterprise buyers require demonstrable auditability and reliability (SOC 2 Type II, uptime evidence) before they commit — hard close gates.",
      specifics: ["SOC 2 Type II", "99.95% uptime SLA", "audit trail required"],
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
    "Enterprise customer call with Northwind Capital tomorrow (2pm) on reliability, audit trail, and go-live " +
    "timeline. A defensible near-term technical plan is due before it, and a security & reliability review " +
    "follows next week — so near-term time pressure is high (~0.85) and commitments will be scrutinised within days.",
  facts: [
    {
      label: "Upcoming meeting",
      value: "Enterprise customer call — tomorrow 2pm",
      source: "notes",
      category: "meeting",
      sourceExcerpt: `"Call with Northwind Capital tomorrow 2pm re: reliability + audit trail."`,
      quantities: [{ metric: "lead time", value: "1", unit: "day" }],
      entities: ["Northwind Capital"],
      implication:
        "The decision's near-term credibility gets judged tomorrow — there is no slack to defer the technical story.",
      confidence: 0.9,
      detail:
        "A major enterprise customer meeting is scheduled for tomorrow; the decision's near-term credibility will be judged there.",
      specifics: ["tomorrow 2pm", "Northwind Capital"],
    },
    {
      label: "Meeting focus",
      value: "Reliability, auditability, implementation timeline",
      source: "notes",
      category: "meeting",
      sourceExcerpt: `"agenda: reliability, audit trail, go-live timeline."`,
      entities: ["reliability", "auditability", "implementation timeline"],
      implication:
        "The agenda centres on exactly the categories a distributed rewrite puts at risk.",
      confidence: 0.85,
      detail:
        "The agenda centres on reliability, auditability, and the implementation timeline — precisely the categories a distributed rewrite puts at risk.",
      specifics: ["reliability", "auditability", "implementation timeline"],
    },
    {
      label: "Deadline",
      value: "Defensible technical plan by the meeting",
      source: "notes",
      category: "deadline",
      sourceExcerpt: `"need a defensible plan before the Northwind call."`,
      quantities: [{ metric: "lead time", value: "1", unit: "day" }],
      entities: ["Northwind Capital"],
      implication:
        "A credible, explainable plan must be ready by tomorrow — raising the weight on timeline and execution risk.",
      confidence: 0.85,
      detail:
        "A credible, explainable near-term technical plan must be ready by the meeting — there is no slack to defer the story.",
      specifics: ["due by tomorrow's call", "Northwind Capital"],
    },
    {
      label: "Urgency",
      value: "High near-term pressure (~0.85)",
      source: "notes",
      category: "urgency",
      sourceExcerpt: `"need a defensible plan before the Northwind call tomorrow."`,
      quantities: [{ metric: "urgency", value: "0.85" }],
      implication:
        "High near-term pressure raises the weight on execution and timeline risk categories in the solver.",
      confidence: 0.8,
      detail:
        "Overall near-term time pressure is high (~0.85), which raises the weight on execution and timeline risk categories.",
      specifics: ["urgency ~0.85"],
    },
    {
      label: "Follow-up",
      value: "Security & reliability review next week",
      source: "notes",
      category: "deadline",
      sourceExcerpt: `"security + reliability review scheduled next week."`,
      quantities: [{ metric: "lead time", value: "1", unit: "week" }],
      entities: ["security & reliability review"],
      implication:
        "Any commitment made tomorrow gets scrutinised within days, so it must survive a review, not just a demo.",
      confidence: 0.8,
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
