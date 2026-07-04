// Harvested from origin/founder-a/context-core (src/llm/reinforce.ts) — THEIR idea (one concrete
// cheap experiment to validate the keystone, tailored to imminent temporal events).
//
// TRANSPORT (Wave B): the live call now goes through the forced-tool-call transport
// (src/llm/structured.ts::structuredCall) — a single FORCED `emit_reinforcement` tool call whose
// input is a tiny { suggestion: string } schema, validated by zod on return. This replaces the old
// free-text first-line scraping. Everything downstream is UNCHANGED — retryOnce + fixture fallback.
//
// INVARIANTS:
//  - Never throws / never 500s: every path catches everything and falls back to a fixture string.
//  - Live fires ONLY when hasApiKey(); offline-with-no-key returns a sensible tailored fixture.
//  - `source` is "live" only when the model produced a non-empty suggestion; every fallback → "fixture".
import { z } from "zod";
import type { Graph } from "@/engine";
import { keystone } from "@/engine";
import type { DecisionContextPack } from "@/context";
import { retryOnce } from "@/agents/retry";
import { hasApiKey, structuredCall } from "./structured";

export type Source = "live" | "fixture";
export interface ReinforcementSuggestion {
  suggestion: string;
  source: Source;
}

// Tiny tool schema: the model returns ONE concrete de-risking experiment as a single sentence.
const ReinforcementSchema = z.object({ suggestion: z.string() });

// Scenario-tailored fixture strings, keyed by the keystone assumption id so the rehearsed
// (offline) demo shows a concrete, decision-specific experiment WITHOUT needing a scenario
// arg threaded through the client. A/B/R keystones are distinct ids (k_credible / k_sre /
// team_has_backend_capacity); any other keystone falls back to a solid generic experiment.
const FIXTURE_BY_KEYSTONE: Record<string, string> = {
  // Scenario A — "migrate to microservices" (meeting tomorrow).
  k_credible:
    "Before the meeting, rehearse the staged-migration plan on a copy of one service end-to-end — including the rollback — so you can defend the timeline and reliability story live tomorrow.",
  // Scenario B — "hire 2 SREs before the pilot".
  k_sre:
    "This week, post the two SRE roles and run one paid on-call trial shift with a contractor to prove the rotation is viable before the pilot — cheaper than betting the pilot on two unfilled hires.",
  // Scenario R — "build our own realtime backend now".
  team_has_backend_capacity:
    "Run a 2-day spike: stand up excalidraw-room on your own infra and load-test one collaborative board, then measure how much of the six-person team's week it actually costs.",
};

function fixtureSuggestion(graph: Graph): string {
  const key = keystone(graph);
  if (!key) return "Identify the single assumption everything rests on, then design the cheapest test that could falsify it first.";
  return (
    FIXTURE_BY_KEYSTONE[key.id] ??
    `Before committing, run the smallest cheap experiment that would prove "${key.label}" true or false — ideally before your next milestone.`
  );
}

const SYSTEM = [
  "You advise founders on de-risking decisions.",
  "Given the single load-bearing (keystone) assumption of a decision, reply with ONE concrete,",
  "cheap experiment or piece of evidence that would validate it BEFORE committing.",
  "If a temporal event or deadline is imminent, tailor the experiment to what to prove or prepare",
  "BEFORE that event, referencing it specifically. Reply with a single sentence, no preamble, no bullets.",
].join(" ");

/** One live attempt: throws on any network/empty failure so retryOnce can retry once. */
async function reinforceRun(keystoneLabel: string, pack?: DecisionContextPack): Promise<string> {
  const temporal =
    pack && pack.relevantTemporalFacts.length > 0
      ? `\n\nIMMINENT TEMPORAL CONTEXT:\n${pack.relevantTemporalFacts.map((f) => `- ${f}`).join("\n")}`
      : "";
  const { suggestion } = await structuredCall({
    system: SYSTEM,
    user: `KEYSTONE ASSUMPTION: ${keystoneLabel}${temporal}`,
    schema: ReinforcementSchema,
    toolName: "emit_reinforcement",
    toolDescription: "Emit ONE concrete, cheap de-risking experiment as a single sentence.",
  });
  const trimmed = suggestion.trim();
  if (!trimmed) throw new Error("empty reinforcement reply");
  return trimmed;
}

/**
 * Suggest how to reinforce the keystone assumption of a graph. Never throws: returns a sensible,
 * decision-tailored fixture string on no key / no keystone / any live failure. `source` is "live"
 * ONLY when the model actually produced a non-empty reply; every fallback reports "fixture".
 */
export async function suggestReinforcement(
  graph: Graph,
  pack?: DecisionContextPack,
): Promise<ReinforcementSuggestion> {
  const key = keystone(graph);
  if (!hasApiKey() || !key) {
    return { suggestion: fixtureSuggestion(graph), source: "fixture" };
  }
  try {
    const suggestion = await retryOnce(() => reinforceRun(key.label, pack));
    return { suggestion, source: "live" };
  } catch {
    return { suggestion: fixtureSuggestion(graph), source: "fixture" };
  }
}
