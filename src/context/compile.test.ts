import { describe, it, expect, beforeEach } from "vitest";
import { compileContext } from "./compile";
import { ContextCompileSchema } from "./schemas";
import { HERO_CONTEXT_INPUT } from "./fixtures";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("compileContext (no key -> fixture fallback)", () => {
  it("returns a schema-valid result without throwing", async () => {
    const result = await compileContext(HERO_CONTEXT_INPUT);
    expect(() => ContextCompileSchema.parse(result)).not.toThrow();
  });

  it("includes temporal facts and non-empty weight adjustments", async () => {
    const { decisionContextPack } = await compileContext(HERO_CONTEXT_INPUT);
    expect(decisionContextPack.relevantTemporalFacts.length).toBeGreaterThan(0);
    expect(decisionContextPack.contextWeightAdjustments.length).toBeGreaterThan(0);
  });

  it("passes the decision text through to the pack", async () => {
    const input = { ...HERO_CONTEXT_INPUT, decisionText: "Should we raise now?" };
    const { decisionContextPack } = await compileContext(input);
    expect(decisionContextPack.decision).toBe("Should we raise now?");
  });
});
