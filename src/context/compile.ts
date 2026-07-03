// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
// Fixture-only stub: returns the pre-baked context fixtures directly and makes NO real Anthropic API calls.
import type { ContextInput, ContextCompileResult } from "./types";
import type { ScenarioId } from "./fixtures";
import {
  fixtureCompanyContext,
  fixtureCompanyContextB,
  fixtureDecisionContextPack,
  fixtureDecisionContextPackB,
} from "./fixtures";

export async function compileContext(
  input: ContextInput,
  scenario?: ScenarioId,
): Promise<ContextCompileResult> {
  // Scenario B = the "reinforce first" decision that HOLDS. Default (A/undefined)
  // keeps returning the hero migrate context so the offline chain is unchanged (T6).
  if (scenario === "B") {
    return {
      companyContext: fixtureCompanyContextB(),
      decisionContextPack: fixtureDecisionContextPackB(input.decisionText),
    };
  }
  return {
    companyContext: fixtureCompanyContext(),
    decisionContextPack: fixtureDecisionContextPack(input.decisionText),
  };
}
