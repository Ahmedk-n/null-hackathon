import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureContextGraphB, fixtureContextGraphR } from "./fixtures";
import { runProbabilistic } from "@/engine/probabilistic";

describe("fixtures carry probabilistic inputs", () => {
  for (const [name, g] of [["A", fixtureContextGraph], ["B", fixtureContextGraphB], ["R", fixtureContextGraphR]] as const) {
    it(`${name} has evidenceStrength on every assumption + at least one driver`, () => {
      const graph = g();
      const assumptions = graph.nodes.filter((n) => n.type === "assumption");
      expect(assumptions.every((a) => a.evidenceStrength)).toBe(true);
      expect((graph.drivers ?? []).length).toBeGreaterThan(0);
    });
    it(`${name} runs the probabilistic solver to a valid result`, () => {
      const r = runProbabilistic(g(), { seed: 1, samples: 1000 });
      expect(r.pHold).toBeGreaterThanOrEqual(0);
      expect(r.pHold).toBeLessThanOrEqual(1);
      expect(r.keystoneDrivers.length).toBeGreaterThan(0);
    });
  }
});
