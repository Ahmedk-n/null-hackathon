import { hasApiKey, structuredCall, withRetryFallback } from "@/llm/structured";
import type { ContextCompileResult, ContextInput } from "./types";
import { ContextCompileSchema, postClamp } from "./schemas";
import { fixtureCompanyContext, fixtureDecisionContextPack } from "./fixtures";

/**
 * SERVER-ONLY (imports @/llm/structured, which loads the Anthropic SDK and reads
 * ANTHROPIC_API_KEY). Must never be imported by client/store/UI code — call it
 * only from src/app/api/context/route.ts. The browser reaches it via fetch.
 */

const CONTEXT_SYSTEM = [
  "You are Keystone's context compiler. Convert free-text business, technical, and temporal",
  "context into a structured CompanyContext and a decision-specific DecisionContextPack.",
  "",
  "Use only the provided context. Do not invent unsupported facts. If information is missing,",
  "add it to missingInfo or missingInformation.",
  "",
  "Keep every displayed fact concise and UI-friendly.",
  "",
  "Temporal context matters. If an upcoming meeting, customer call, board update, launch,",
  "incident review, or deadline changes the decision pressure, express that through",
  "contextWeightAdjustments.",
  "",
  "The most important output is contextWeightAdjustments. Each adjustment explains how context",
  "changes the analysis category: market, execution, technical, competitor, opportunity_cost,",
  "timeline, reliability, or auditability. An imminent event should typically INCREASE weight on",
  "timeline, execution, reliability, and auditability.",
  "",
  "Every score is between 0 and 1. Return only data matching the schema.",
].join("\n");

function renderInput(input: ContextInput): string {
  return [
    "BUSINESS CONTEXT:",
    input.businessContextText || "(none provided)",
    "",
    "TECHNICAL CONTEXT:",
    input.technicalContextText || "(none provided)",
    "",
    "TEMPORAL CONTEXT / UPCOMING COMMITMENTS:",
    input.temporalContextText || "(none provided)",
    "",
    "DECISION:",
    input.decisionText || "(none provided)",
  ].join("\n");
}

/**
 * Compile raw context text into { companyContext, decisionContextPack }.
 * No key -> fixture. Live failure -> retry once -> fixture. Never throws.
 */
export async function compileContext(
  input: ContextInput,
): Promise<ContextCompileResult> {
  const fallback = (): ContextCompileResult => ({
    companyContext: fixtureCompanyContext(),
    decisionContextPack: fixtureDecisionContextPack(input.decisionText || undefined),
  });

  if (!hasApiKey()) return fallback();

  return withRetryFallback<ContextCompileResult>(
    async () => {
      const raw = await structuredCall<ContextCompileResult>({
        system: CONTEXT_SYSTEM,
        user: renderInput(input),
        schema: ContextCompileSchema,
        toolName: "emit_context",
        toolDescription: "Emit the compiled CompanyContext and DecisionContextPack.",
      });
      return postClamp(raw);
    },
    fallback,
  );
}
