import type { Graph } from "@/engine";
import { keystone } from "@/engine";
import type { DecisionContextPack } from "@/context/types";
import { ReinforcementSchema, type ReinforcementOutput } from "./schemas";
import { hasApiKey, structuredCall, withRetryFallback } from "./structured";

const SYSTEM_BASE =
  "You advise founders on de-risking decisions. Given the single load-bearing assumption of a " +
  "decision, reply with one concrete, cheap experiment or piece of evidence that would validate " +
  "it before committing. One sentence.";

const SYSTEM_CONTEXT =
  " Tailor the suggestion to the company's near-term reality: if a temporal event is imminent, " +
  "propose what to prove or prepare BEFORE that event, referencing the specific event/deadline.";

/**
 * Suggest how to reinforce the keystone assumption of a graph. Never throws:
 * returns a sensible fallback string on no key / failure / no keystone.
 */
export async function suggestReinforcement(
  graph: Graph,
  pack?: DecisionContextPack,
): Promise<string> {
  const key = keystone(graph);
  const fallback = (): string =>
    key
      ? `Before committing, run the smallest test that would prove "${key.label}" true or false.`
      : "Identify the assumption everything rests on, then validate it first.";

  if (!hasApiKey() || !key) return fallback();

  const temporalHint = pack
    ? `\nRelevant temporal facts:\n${pack.relevantTemporalFacts.map((f) => `- ${f}`).join("\n")}`
    : "";

  return withRetryFallback<string>(
    async () => {
      const out: ReinforcementOutput = await structuredCall<ReinforcementOutput>({
        system: SYSTEM_BASE + (pack ? SYSTEM_CONTEXT : ""),
        user: `Keystone assumption: ${key.label}${temporalHint}`,
        schema: ReinforcementSchema,
        toolName: "emit_reinforcement",
        toolDescription: "Emit one concrete validation suggestion.",
      });
      return out.suggestion;
    },
    fallback,
  );
}
