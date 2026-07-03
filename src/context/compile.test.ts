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

  it("surfaces decision-relevant temporal facts and near-term weight increases", async () => {
    const { decisionContextPack } = await compileContext(HERO_CONTEXT_INPUT);
    // temporal facts must actually convey the near-term pressure, not just be non-empty
    expect(decisionContextPack.relevantTemporalFacts.join(" ").toLowerCase()).toMatch(
      /meeting|tomorrow|reliability|timeline/,
    );
    // and the context must raise weight on at least one near-term category
    const increased = new Set(
      decisionContextPack.contextWeightAdjustments
        .filter((w) => w.direction === "increase")
        .map((w) => w.targetCategory),
    );
    expect(
      ["execution", "reliability", "auditability", "timeline"].some((c) => increased.has(c as never)),
    ).toBe(true);
  });

  it("passes the decision text through to the pack", async () => {
    const input = { ...HERO_CONTEXT_INPUT, decisionText: "Should we raise now?" };
    const { decisionContextPack } = await compileContext(input);
    expect(decisionContextPack.decision).toBe("Should we raise now?");
  });
});
