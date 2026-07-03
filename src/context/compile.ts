// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
// Fixture-only stub: returns the pre-baked context fixtures directly and makes NO real Anthropic API calls.
import type { ContextInput, ContextCompileResult } from "./types";
import { fixtureCompanyContext, fixtureDecisionContextPack } from "./fixtures";

export async function compileContext(input: ContextInput): Promise<ContextCompileResult> {
  return {
    companyContext: fixtureCompanyContext(),
    decisionContextPack: fixtureDecisionContextPack(input.decisionText),
  };
}
