import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureCompanyContext, fixtureDecisionContextPack } from "@/context";
import { weighContext } from "./weigh";

describe("weighContext (no API key)", () => {
  it("returns fixture-fallback node weightings grounded in the graph, without throwing", async () => {
    const graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();
    const company = fixtureCompanyContext();

    const result = await weighContext(graph, pack, company, []);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    expect(result.source).toBe("fixture");
    expect(Array.isArray(result.nodeWeights)).toBe(true);
    expect(result.nodeWeights.length).toBeGreaterThan(0);
    for (const w of result.nodeWeights) {
      expect(nodeIds.has(w.nodeId)).toBe(true);
      expect(w.contextWeight).toBeGreaterThanOrEqual(0);
      expect(w.contextWeight).toBeLessThanOrEqual(1);
    }

    if (result.contextKeystoneId !== null) {
      expect(nodeIds.has(result.contextKeystoneId)).toBe(true);
    }
  });
});
