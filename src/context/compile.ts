// compileContext: one live Claude call that turns the four context textareas into a
// { companyContext, decisionContextPack } pair, with a deterministic fixture fallback.
//
// TRANSPORT (Wave B): the live call now goes through the forced-tool-call transport
// (src/llm/structured.ts::structuredCall) — a single FORCED `emit_context` tool call whose
// input schema is ContextCompileSchema, validated by zod on return. This replaces the old
// free-text JSON scraping (messages.create → collectText → first-balanced-JSON → safeParse):
// the API returns schema-shaped `tool_use.input`, killing the prose-wrap / truncated-brace /
// markdown-fence silent-fallback failures. Everything downstream is UNCHANGED:
//   structuredCall → postClamp → source:"live"; retryOnce owns the single retry; catch → fixture.
//
// INVARIANTS:
//   • FIXTURES ALWAYS WIN when a `scenario` is passed (pinned demo). Scenario short-circuit
//     precedes the live branch, so scenario A/B stay byte-deterministic (T5/T6).
//   • Live fires ONLY when there is an API key AND no scenario.
//   • Never throws: ANY failure (no key, timeout, schema miss, no tool_use) → fixture.
//   • No wall clock: this module never calls `new Date()`/`Date.now()`. The temporal text the
//     user pastes carries its own dates ("tomorrow", explicit calendar dates); we never inject
//     a "today", so nothing here is time-dependent and the offline demo stays deterministic.
import type { ContextInput, ContextRouteResponse } from "./types";
import type { ScenarioId } from "./fixtures";
import { ContextCompileSchema, postClamp } from "./schemas";
import {
  fixtureCompanyContext,
  fixtureCompanyContextB,
  fixtureCompanyContextR,
  fixtureDecisionContextPack,
  fixtureDecisionContextPackB,
  fixtureDecisionContextPackR,
} from "./fixtures";
import { retryOnce } from "@/agents/retry";
import { hasApiKey, structuredCall } from "@/llm/structured";

// STRUCTURAL finding shape (V8-C1). This is a plain mirror of the rich GatherFinding the agents
// emit (label/value/source + sourceExcerpt/quantities/entities/dateISO/implication). We define it
// LOCALLY on purpose: importing @/agents/types would pull the agent module graph into the context
// layer and risks tripping src/context/boundary.test.ts's SDK-leak guard, so we keep a purely
// structural type and let the route/KeystoneApp map GatherFinding → this shape at the seam.
export interface ContextFinding {
  source: string;
  label: string;
  value: string;
  sourceExcerpt?: string;
  quantities?: { metric: string; value: string; unit?: string }[];
  entities?: string[];
  dateISO?: string;
  implication?: string;
}

// Combined §6.1 (compileCompanyContext) + §6.2 (buildDecisionContextPack) + grounding rules +
// an explicit field skeleton, so the one call returns a single ContextCompileSchema-valid object.
const CONTEXT_SYSTEM = `You are Keystone's context compiler. Convert three free-text descriptions of a company —
business, technical, and temporal — plus the decision the user is weighing, into ONE structured
JSON object with exactly two top-level keys: "companyContext" and "decisionContextPack".

GROUNDING RULES: Use only the business, technical, and temporal context provided. Do NOT invent
facts that are not supported by the input. When something needed is not stated, add it to
missingInfo/missingInformation rather than guessing. Keep every string concise (<= 20 words).
Produce COMPANY-SPECIFIC items, not generic best-practice. Every score is a number in 0..1.

SUPPLIED FINDINGS (V8-C1): You may also be given a SUPPLIED FINDINGS block — typed, multi-source
research where each finding carries a source (file path / url / "notes"), an optional verbatim
excerpt, extracted quantities and named entities, an optional ISO date, and an implication. When
findings are present, GROUND every constraint, objective, and known-risk in them: cite the
contributing finding's SOURCE inside the statement/reason, and reuse the findings' quantities and
entities so items stay specific. When a fact you need is ABSENT from both the findings and the
free-text context, list it in missingInfo/missingInformation rather than inventing it.

CROSS-SOURCE SYNTHESIS (V8-C4): The strongest risks and constraints emerge when signals from
DIFFERENT sources COMBINE — e.g. a temporal event ("auditability review tomorrow") + a business
requirement ("SOC2 mandated by top customer") + a technical gap ("no observability / audit
logging") together imply ONE high-severity known-risk. DERIVE such compound risks explicitly, set
severity/likelihood to reflect the compounding, and CITE ALL contributing sources in the statement
and in the matching contextWeightAdjustment reason. PREFER risks and constraints corroborated by
MULTIPLE sources; when an item rests on a SINGLE source, keep its likelihood/severity lower to
signal lower confidence. Apply the same multi-source-first bias to the weight adjustments.

companyContext:
  business: { companyStage?, industry?, customers[], revenueModel?, competitors[],
    strategicGoals[], growthBottlenecks[], marketConstraints[] } — omit optional scalars you
    cannot support from the text; use [] for empty lists.
  technical: { stack[], architecture?, infrastructure[], integrations[], deploymentProcess?,
    observability?, teamSize? (integer >= 0), technicalDebt[], engineeringConstraints[] }.
  temporal: { upcomingEvents[], deadlines[], urgencyLevel (0..1) }.
    Each upcomingEvent: { id, type, title, dateDescription, relevanceToDecision, importance(0..1) }
      where type is one of: investor_meeting, customer_call, board_update, architecture_review,
      incident_review, launch, hiring_deadline, fundraising_deadline, other.
    Each deadline: { id, title, dateDescription, consequenceIfMissed, severity(0..1) }.
    Parse upcomingEvents and deadlines FROM THE TEMPORAL TEXT. Where the text states an explicit
    calendar date, record it as an ISO date (YYYY-MM-DD) in dateDescription; otherwise keep the
    user's verbatim phrasing (e.g. "tomorrow"). You are NOT given a current date — never compute
    or assume one; only surface dates that the text itself carries.
  constraints[]: { id, type(time|budget|team|technical|market|regulatory), statement, severity(0..1) }
  objectives[]: { id, statement, priority(0..1) }
  knownRisks[]: { id, category(market|execution|technical|competitor|opportunity_cost),
    statement, likelihood(0..1), severity(0..1) }
  missingInfo[]: anything you genuinely could not determine from the inputs.

decisionContextPack — the decision-relevant slice of the above:
  { decision, relevantBusinessFacts[], relevantTechnicalFacts[], relevantTemporalFacts[],
    relevantConstraints[], relevantObjectives[], relevantKnownRisks[],
    contextWeightAdjustments[], missingInformation[] }.
  Select only facts RELEVANT to this specific decision; each short and traceable to the input.
  Carry over the relevant constraints/objectives/knownRisks using the SAME shapes as above.

  contextWeightAdjustments[] is THE MOST IMPORTANT OUTPUT. Each: { targetCategory, direction, magnitude, reason }.
    targetCategory MUST be one of the WeightCategory enum: market, execution, technical, competitor,
      opportunity_cost, timeline, reliability, auditability.
    direction is "increase" or "decrease"; magnitude is 0..1; reason is ONE sentence that
      REFERENCES the actual inputs (name the specific event, deadline, constraint, or fact).
    Temporal context is decisive: an imminent event (e.g. a customer meeting tomorrow) should
      INCREASE weight on timeline, execution, reliability, and auditability, and may DECREASE the
      attractiveness of large, slow, risky changes near-term. If the context is thin, say so in
      missingInformation and keep adjustments modest.

Return ONLY the single JSON object matching this schema exactly — no prose, no markdown fences.`;

// V8-C1 · render the gathered multi-source research as a citable block appended to the user
// message. Each finding surfaces its source + excerpt + quantities/entities/date + implication so
// the compiler can ground constraints/objectives/known-risks in it and synthesise across sources.
function renderFindings(findings: ContextFinding[]): string {
  const lines: string[] = [
    "SUPPLIED FINDINGS (multi-source research — GROUND every item in these and CITE the source):",
  ];
  findings.forEach((f, i) => {
    lines.push(`[${i + 1}] (${f.source}) ${f.label}: ${f.value}`);
    if (f.sourceExcerpt) lines.push(`    excerpt: "${f.sourceExcerpt}"`);
    if (f.quantities && f.quantities.length > 0) {
      lines.push(
        `    quantities: ${f.quantities
          .map((q) => `${q.metric}=${q.value}${q.unit ? ` ${q.unit}` : ""}`)
          .join(", ")}`,
      );
    }
    if (f.entities && f.entities.length > 0) lines.push(`    entities: ${f.entities.join(", ")}`);
    if (f.dateISO) lines.push(`    date: ${f.dateISO}`);
    if (f.implication) lines.push(`    implication: ${f.implication}`);
  });
  return lines.join("\n");
}

function renderContextUser(input: ContextInput, findings?: ContextFinding[]): string {
  const parts = [
    "BUSINESS CONTEXT:",
    input.businessContextText,
    "",
    "TECHNICAL CONTEXT:",
    input.technicalContextText,
    "",
    "TEMPORAL CONTEXT / UPCOMING COMMITMENTS:",
    input.temporalContextText,
    "",
    "DECISION:",
    input.decisionText,
  ];
  // Findings absent → user message is byte-identical to before (behaviour unchanged).
  if (findings && findings.length > 0) parts.push("", renderFindings(findings));
  return parts.join("\n");
}

// Scenario short-circuit + every failure path lands here. FIXTURES ALWAYS WIN under a scenario.
function fixtureResult(input: ContextInput, scenario?: ScenarioId): ContextRouteResponse {
  if (scenario === "R") {
    return {
      companyContext: fixtureCompanyContextR(),
      decisionContextPack: fixtureDecisionContextPackR(input.decisionText),
      source: "fixture",
    };
  }
  if (scenario === "B") {
    return {
      companyContext: fixtureCompanyContextB(),
      decisionContextPack: fixtureDecisionContextPackB(input.decisionText),
      source: "fixture",
    };
  }
  return {
    companyContext: fixtureCompanyContext(),
    decisionContextPack: fixtureDecisionContextPack(input.decisionText),
    source: "fixture",
  };
}

export async function compileContext(
  input: ContextInput,
  scenario?: ScenarioId,
  // V8-C1 · the agents' gathered multi-source research. Affects ONLY the live path — a pinned
  // scenario still short-circuits to the deterministic fixture before findings are ever read.
  findings?: ContextFinding[],
): Promise<ContextRouteResponse> {
  // (a) A scenario is pinned → deterministic fixture (demo invariant). (b) No key → fixture.
  if (scenario) return fixtureResult(input, scenario);
  if (!hasApiKey()) return fixtureResult(input, scenario);

  // (c) Live: single FORCED-tool call, retried once, validated + clamped, else fixture.
  try {
    const parsed = await retryOnce(() =>
      structuredCall({
        system: CONTEXT_SYSTEM,
        user: renderContextUser(input, findings),
        schema: ContextCompileSchema,
        toolName: "emit_context",
        toolDescription:
          "Emit the compiled companyContext + decisionContextPack as ONE structured object.",
      }),
    );
    const clamped = postClamp(parsed);
    return { ...clamped, source: "live" };
  } catch {
    return fixtureResult(input, scenario);
  }
}
