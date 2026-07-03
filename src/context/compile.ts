// compileContext: one live Claude call that turns the four context textareas into a
// { companyContext, decisionContextPack } pair, with a deterministic fixture fallback.
//
// GUARDRAIL AMENDMENT (documented in docs/.../2026-07-04-keystone-v3.md): GOAL.md mandates
// messages.parse + zodOutputFormat, but NEITHER exists in @anthropic-ai/sdk@0.68.0. So this
// mirrors the repo's proven-live pattern (src/agents/business.ts, verified live 2026-07-04):
//   new Anthropic({ maxRetries: 0 }) → messages.create (timeout) → collectText →
//   first-balanced-JSON extract → zod safeParse → postClamp → retryOnce → fixture fallback.
//
// INVARIANTS:
//   • FIXTURES ALWAYS WIN when a `scenario` is passed (pinned demo). Scenario short-circuit
//     precedes the live branch, so scenario A/B stay byte-deterministic (T5/T6).
//   • Live fires ONLY when there is an API key AND no scenario.
//   • Never throws: ANY failure (no key, timeout, malformed JSON, schema miss) → fixture.
//   • No wall clock: this module never calls `new Date()`/`Date.now()`. The temporal text the
//     user pastes carries its own dates ("tomorrow", explicit calendar dates); we never inject
//     a "today", so nothing here is time-dependent and the offline demo stays deterministic.
import Anthropic from "@anthropic-ai/sdk";
import type { ContextInput, ContextRouteResponse } from "./types";
import type { ScenarioId } from "./fixtures";
import { ContextCompileSchema, postClamp } from "./schemas";
import {
  fixtureCompanyContext,
  fixtureCompanyContextB,
  fixtureDecisionContextPack,
  fixtureDecisionContextPackB,
} from "./fixtures";
import { retryOnce } from "@/agents/retry";

const MODEL = "claude-opus-4-8";
// Hard per-request deadline. One compile is a single (non-tool) reasoning turn producing a
// medium JSON object; 45s gives Opus comfortable headroom and retryOnce fires a second fresh
// attempt if the first overruns. On timeout the SDK rejects → catch → fixture fallback.
const REQUEST_TIMEOUT_MS = 45_000;

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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

function renderContextUser(input: ContextInput): string {
  return [
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
  ].join("\n");
}

/** Concatenated text of all `text` content blocks (mirrors src/agents/schemas.ts::collectText). */
function collectText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      out.push((block as { text: string }).text);
    }
  }
  return out.join("\n");
}

// Scenario short-circuit + every failure path lands here. FIXTURES ALWAYS WIN under a scenario.
function fixtureResult(input: ContextInput, scenario?: ScenarioId): ContextRouteResponse {
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
): Promise<ContextRouteResponse> {
  // (a) A scenario is pinned → deterministic fixture (demo invariant). (b) No key → fixture.
  if (scenario) return fixtureResult(input, scenario);
  if (!hasApiKey()) return fixtureResult(input, scenario);

  // (c) Live: single reasoning call, retried once, validated + clamped, else fixture.
  try {
    // maxRetries: 0 — retryOnce owns the single guardrail retry; the SDK's default auto-retry
    // would otherwise stack multiple 45s timeouts and blow the deadline.
    const client = new Anthropic({ maxRetries: 0 });
    const res = await retryOnce(() =>
      client.messages.create(
        {
          model: MODEL,
          max_tokens: 16_000,
          system: CONTEXT_SYSTEM,
          messages: [{ role: "user", content: renderContextUser(input) }],
        },
        { timeout: REQUEST_TIMEOUT_MS },
      ),
    );

    const text = collectText(res.content);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return fixtureResult(input, scenario);

    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    const check = ContextCompileSchema.safeParse(parsed);
    if (!check.success) return fixtureResult(input, scenario);

    const clamped = postClamp(check.data);
    return { ...clamped, source: "live" };
  } catch {
    return fixtureResult(input, scenario);
  }
}
