import { describe, it, expect } from "vitest";
import type { Graph } from "./types";
import { clamp01, computeSupport, integrity, topoOrder } from "./propagation";

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

describe("clamp01", () => {
  it("clamps out-of-range and NaN to [0,1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe("topoOrder", () => {
  it("orders children before parents", () => {
    const order = topoOrder(sampleGraph());
    expect(order.indexOf("a1")).toBeLessThan(order.indexOf("A"));
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("T"));
  });

  it("throws a clear error on a cycle", () => {
    const cyclic: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["A"] }] },
        { id: "A", type: "claim", label: "a", confidence: 1, groups: [{ kind: "AND", childIds: ["T"] }] },
      ],
    };
    expect(() => topoOrder(cyclic)).toThrow(/cycle detected/);
  });

  it("skips unknown child ids without throwing", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["ghost"] }] },
      ],
    };
    expect(() => topoOrder(g)).not.toThrow();
    // ghost has no support -> AND product with a missing member is 0
    expect(computeSupport(g).get("T")).toBeCloseTo(0);
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

  it("combines multiple groups on one node by product", () => {
    // T = conf(1) * AND(k=0.9) * OR(max(0.5,0.8)=0.8) = 0.72
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["k"] }, { kind: "OR", childIds: ["p", "q"] }] },
        { id: "k", type: "assumption", label: "k", confidence: 0.9, groups: [] },
        { id: "p", type: "assumption", label: "p", confidence: 0.5, groups: [] },
        { id: "q", type: "assumption", label: "q", confidence: 0.8, groups: [] },
      ],
    };
    expect(computeSupport(g).get("T")).toBeCloseTo(0.72);
  });

  it("clamps out-of-range confidences", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [{ id: "T", type: "thesis", label: "d", confidence: 5, groups: [] }],
    };
    expect(computeSupport(g).get("T")).toBe(1);
  });
});

describe("integrity", () => {
  it("is thesis support times 100", () => {
    expect(integrity(sampleGraph())).toBeCloseTo(40);
  });
});
