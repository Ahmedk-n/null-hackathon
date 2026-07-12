import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureCompanyContext, fixtureDecisionContextPack } from "@/context";
import { stressContext } from "./stress";

describe("stressContext (no API key)", () => {
  it("returns fixture-fallback contextual attacks grounded in the graph, without throwing", async () => {
    const graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();
    const company = fixtureCompanyContext();

    const result = await stressContext(graph, pack, company, []);
    const { attacks } = result;

    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    expect(result.source).toBe("fixture");
    expect(Array.isArray(attacks)).toBe(true);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.length).toBeLessThanOrEqual(8);
    for (const a of attacks) {
      expect(nodeIds.has(a.targetId)).toBe(true);
      expect(a.severity).toBeGreaterThanOrEqual(0.15);
      expect(a.severity).toBeLessThanOrEqual(0.55);
    }
  });
});
