import { describe, it, expect } from "vitest";
import { compileContext } from "@/context/compile";
import { extractStructure, generateAttacks } from "@/llm/client";
import { ContextCompileSchema } from "@/context/schemas";
import { GraphSchema, AttacksSchema } from "@/llm/schemas";
import { validateGraph, validateAttacks } from "@/llm/validate";

/**
 * LIVE smoke test — hits the real Claude API (absorbed from founder-a, ADAPTED to
 * our client signatures). SKIPPED unless ANTHROPIC_API_KEY is set, so the offline
 * suite never depends on a key and stays green. Asserts SHAPE/SCHEMA only (never
 * model content), keeping it deterministic and cheap. Run with:
 *   ANTHROPIC_API_KEY=... npx vitest run src/llm/live-smoke.test.ts
 *
 * Adaptations from founder-a's version:
 *  - compileContext takes our { businessContextText, technicalContextText,
 *    temporalContextText, decisionText } input and returns { companyContext,
 *    decisionContextPack, source }.
 *  - graph/attack validation lives in @/llm/validate (validateGraph / validateAttacks,
 *    which return the repaired value | null) rather than founder-a's engine-side
 *    isGraphWellFormed / validateAttacks(...).ok.
 */
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasKey)("LLM live smoke (requires ANTHROPIC_API_KEY)", () => {
  it("context -> extract -> attacks pipeline returns schema-valid structured output", async () => {
    // small input to control cost
    const { companyContext, decisionContextPack } = await compileContext({
      businessContextText: "Seed-stage B2B SaaS with a few enterprise customers.",
      technicalContextText: "Node monolith, basic CI, three engineers.",
      temporalContextText: "Investor update next week.",
      decisionText: "Should we hire a second backend engineer now?",
    });
    expect(() =>
      ContextCompileSchema.parse({ companyContext, decisionContextPack }),
    ).not.toThrow();
    expect(Array.isArray(decisionContextPack.contextWeightAdjustments)).toBe(true);

    const graph = await extractStructure(decisionContextPack.decision, decisionContextPack);
    expect(() => GraphSchema.parse(graph)).not.toThrow();
    // validateGraph returns the repaired graph (no dangling refs / cycles) or null.
    expect(validateGraph(graph)).not.toBeNull();

    const attacks = await generateAttacks(graph, decisionContextPack);
    expect(() => AttacksSchema.parse({ attacks })).not.toThrow();
    // validateAttacks returns the repaired set (every target is a real assumption) or null.
    expect(validateAttacks(graph, attacks)).not.toBeNull();
  }, 120000);
});
