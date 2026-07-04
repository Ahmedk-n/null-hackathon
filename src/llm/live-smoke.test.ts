import { describe, it, expect } from "vitest";
import { compileContext } from "@/context/compile";
import { extractStructure, generateAttacks } from "@/llm/client";
import { ContextCompileSchema } from "@/context/schemas";
import { GraphSchema, AttacksSchema } from "@/llm/schemas";
import { isGraphWellFormed, validateAttacks } from "@/engine";

/**
 * LIVE smoke test — hits the real Claude API. SKIPPED unless ANTHROPIC_API_KEY
 * is set, so the normal suite never depends on a key. Asserts SHAPE/SCHEMA only
 * (never model content), keeping it deterministic and cheap. Run with:
 *   ANTHROPIC_API_KEY=... npm run smoke:llm
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
    expect(() => ContextCompileSchema.parse({ companyContext, decisionContextPack })).not.toThrow();
    expect(Array.isArray(decisionContextPack.contextWeightAdjustments)).toBe(true);

    const graph = await extractStructure(decisionContextPack.decision, decisionContextPack);
    expect(() => GraphSchema.parse(graph)).not.toThrow();
    expect(isGraphWellFormed(graph)).toBe(true); // no dangling refs

    const attacks = await generateAttacks(graph, decisionContextPack);
    expect(() => AttacksSchema.parse({ attacks })).not.toThrow();
    expect(validateAttacks(graph, attacks).ok).toBe(true); // every target is a real assumption
  }, 120000);
});
