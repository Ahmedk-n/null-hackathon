import { describe, it, expect } from "vitest";
import { runProbabilistic } from "./probabilistic";
import { integrity } from "./propagation";
import type { Graph } from "./types";

// thesis (AND of one claim) ← claim (AND of two leaf assumptions)
function graph(a1 = 0.8, a2 = 0.8, strength: any = "moderate", drivers?: any): Graph {
  return {
    thesisId: "t",
    drivers,
    nodes: [
      { id: "t", type: "thesis", label: "T", confidence: 1, groups: [{ kind: "AND", childIds: ["c"] }] },
      { id: "c", type: "claim", label: "C", confidence: 1, groups: [{ kind: "AND", childIds: ["a1", "a2"] }] },
      { id: "a1", type: "assumption", label: "A1", confidence: a1, evidenceStrength: strength, groups: [] },
      { id: "a2", type: "assumption", label: "A2", confidence: a2, evidenceStrength: strength, groups: [] },
    ],
  };
}

describe("runProbabilistic", () => {
  it("is deterministic for a fixed seed", () => {
    const r1 = runProbabilistic(graph(), { seed: 42, samples: 1000 });
    const r2 = runProbabilistic(graph(), { seed: 42, samples: 1000 });
    expect(r1).toEqual(r2);
  });

  it("zero-spread (strong evidence, no drivers) collapses to the deterministic integrity", () => {
    // strong spread is small but non-zero; assert mean is within a tight band of the point solve.
    const g = graph(0.8, 0.8, "strong");
    const r = runProbabilistic(g, { seed: 1, samples: 4000 });
    expect(Math.abs(r.mean - integrity(g))).toBeLessThan(4); // 0..100 scale
  });

  it("weak evidence widens the band vs strong", () => {
    const weak = runProbabilistic(graph(0.7, 0.7, "weak"), { seed: 3, samples: 4000 });
    const strong = runProbabilistic(graph(0.7, 0.7, "strong"), { seed: 3, samples: 4000 });
    const w = weak.band[1] - weak.band[0];
    const s = strong.band[1] - strong.band[0];
    expect(w).toBeGreaterThan(s);
  });

  it("shared driver raises joint-failure probability vs independent", () => {
    const drivers = [{ id: "d1", label: "vendor", loadings: [{ assumptionId: "a1", loading: 0.9 }, { assumptionId: "a2", loading: 0.9 }] }];
    const correlated = runProbabilistic(graph(0.6, 0.6, "weak", drivers), { seed: 5, samples: 6000 });
    const independent = runProbabilistic(graph(0.6, 0.6, "weak"), { seed: 5, samples: 6000 });
    // correlated collapse fattens the low tail → lower pHold at the same marginals.
    expect(correlated.pHold).toBeLessThan(independent.pHold);
  });

  it("reports pHold in [0,1] and an ordered band", () => {
    const r = runProbabilistic(graph(), { seed: 9, samples: 500 });
    expect(r.pHold).toBeGreaterThanOrEqual(0);
    expect(r.pHold).toBeLessThanOrEqual(1);
    expect(r.band[0]).toBeLessThanOrEqual(r.band[1]);
    expect(r.samples).toBe(500);
  });
});
