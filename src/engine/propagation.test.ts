import { describe, it, expect } from "vitest";
import type { Graph } from "./types";
import { computeSupport, integrity, topoOrder } from "./propagation";

// thesis <- (AND) claimA, claimB ; claimA <- (AND) a1 ; claimB <- (AND) a2
function sampleGraph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "decision", confidence: 1, groups: [{ kind: "AND", childIds: ["A", "B"] }] },
      { id: "A", type: "claim", label: "claim A", confidence: 1, groups: [{ kind: "AND", childIds: ["a1"] }] },
      { id: "B", type: "claim", label: "claim B", confidence: 1, groups: [{ kind: "AND", childIds: ["a2"] }] },
      { id: "a1", type: "assumption", label: "assumption 1", confidence: 0.5, groups: [] },
      { id: "a2", type: "assumption", label: "assumption 2", confidence: 0.8, groups: [] },
    ],
  };
}

describe("topoOrder", () => {
  it("orders children before parents", () => {
    const order = topoOrder(sampleGraph());
    expect(order.indexOf("a1")).toBeLessThan(order.indexOf("A"));
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("T"));
  });
});

describe("computeSupport", () => {
  it("leaf support equals its confidence", () => {
    const s = computeSupport(sampleGraph());
    expect(s.get("a1")).toBeCloseTo(0.5);
    expect(s.get("a2")).toBeCloseTo(0.8);
  });

  it("AND group multiplies member supports times own confidence", () => {
    const s = computeSupport(sampleGraph());
    // A = 1 * (a1) = 0.5 ; B = 1 * (a2) = 0.8 ; T = 1 * (A*B) = 0.4
    expect(s.get("A")).toBeCloseTo(0.5);
    expect(s.get("B")).toBeCloseTo(0.8);
    expect(s.get("T")).toBeCloseTo(0.4);
  });

  it("OR group takes the max member support", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "OR", childIds: ["x", "y"] }] },
        { id: "x", type: "assumption", label: "x", confidence: 0.3, groups: [] },
        { id: "y", type: "assumption", label: "y", confidence: 0.9, groups: [] },
      ],
    };
    expect(computeSupport(g).get("T")).toBeCloseTo(0.9);
  });
});

describe("integrity", () => {
  it("is thesis support times 100", () => {
    expect(integrity(sampleGraph())).toBeCloseTo(40);
  });
});
