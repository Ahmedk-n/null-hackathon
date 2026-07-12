import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureDecisionContextPack } from "@/context";
import { debateSkeptic } from "./debate";

describe("debateSkeptic (no API key)", () => {
  it("returns fixture-fallback hidden assumptions + fracture narrative, without throwing", async () => {
    const graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();

    const result = await debateSkeptic(graph, pack, []);

    expect(Array.isArray(result.hiddenAssumptions)).toBe(true);
    expect(result.hiddenAssumptions.length).toBeLessThanOrEqual(3);
    for (const a of result.hiddenAssumptions) {
      expect(typeof a.label).toBe("string");
      expect(typeof a.why).toBe("string");
      expect(Array.isArray(a.evidenceRefs)).toBe(true);
    }
    expect(typeof result.fractureNarrative).toBe("string");
    expect(result.fractureNarrative.length).toBeGreaterThan(0);
  });
});
