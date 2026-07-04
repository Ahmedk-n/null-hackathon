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

// ── V7-1 · depth-robust typed-AND aggregation ─────────────────────────────────
// AND of all-LEAF children (independent corroborating premises) = geometric mean;
// AND with an INTERNAL child (a sub-goal) = product; single child = passthrough; OR = max.
describe("typed-AND aggregation (V7-1)", () => {
  // A claim resting on 4 honest leaf assumptions at 0.8 stays 0.8 — NOT 0.8^4 = 0.41.
  it("AND of all-leaf children uses the geometric mean (breadth-robust)", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "claim", label: "claim", confidence: 1, groups: [{ kind: "AND", childIds: ["a", "b", "c", "d"] }] },
        { id: "a", type: "assumption", label: "a", confidence: 0.8, groups: [] },
        { id: "b", type: "assumption", label: "b", confidence: 0.8, groups: [] },
        { id: "c", type: "assumption", label: "c", confidence: 0.8, groups: [] },
        { id: "d", type: "assumption", label: "d", confidence: 0.8, groups: [] },
      ],
    };
    expect(computeSupport(g).get("T")).toBeCloseTo(0.8, 5); // geomean, not 0.4096
  });

  // Zeroing ANY member of a geometric-mean AND still zeros the group → knock-out craters.
  it("a zeroed child craters an all-leaf AND group (knock-out preserved)", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "claim", label: "claim", confidence: 1, groups: [{ kind: "AND", childIds: ["a", "b"] }] },
        { id: "a", type: "assumption", label: "a", confidence: 0, groups: [] },
        { id: "b", type: "assumption", label: "b", confidence: 0.9, groups: [] },
      ],
    };
    expect(computeSupport(g).get("T")).toBe(0);
  });

  // AND with an internal (sub-goal) child multiplies — conjunctive requirements crater.
  it("AND with an internal child uses the product (collapse-preserving)", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "t", confidence: 1, groups: [{ kind: "AND", childIds: ["c1", "c2"] }] },
        { id: "c1", type: "claim", label: "c1", confidence: 1, groups: [{ kind: "AND", childIds: ["x"] }] },
        { id: "c2", type: "claim", label: "c2", confidence: 1, groups: [{ kind: "AND", childIds: ["y"] }] },
        { id: "x", type: "assumption", label: "x", confidence: 0.8, groups: [] },
        { id: "y", type: "assumption", label: "y", confidence: 0.8, groups: [] },
      ],
    };
    // c1, c2 are internal → thesis AND = product = 0.8 × 0.8 = 0.64 (NOT geomean 0.8).
    expect(computeSupport(g).get("T")).toBeCloseTo(0.64, 5);
  });
});

describe("depth-robustness (V7-1)", () => {
  // A genuinely deep, wide, honest tree stays MEANINGFUL — the whole point of the rule.
  // thesis(1.0) = AND(3 claims); each claim(1.0) = AND(3 leaf assumptions @0.8) → geomean 0.8;
  // thesis = product(0.8, 0.8, 0.8) = 0.512. Old product-AND would give 0.8^9 = 0.134 (~13% = "collapsed").
  it("a 4-layer wide honest tree integrates to a meaningful value (not ~0)", () => {
    const claim = (id: string, a: string[]): Graph["nodes"] => [
      { id, type: "claim", label: id, confidence: 1, groups: [{ kind: "AND", childIds: a }] },
      ...a.map((x) => ({ id: x, type: "assumption" as const, label: x, confidence: 0.8, groups: [] })),
    ];
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "t", confidence: 1, groups: [{ kind: "AND", childIds: ["c1", "c2", "c3"] }] },
        ...claim("c1", ["c1a", "c1b", "c1c"]),
        ...claim("c2", ["c2a", "c2b", "c2c"]),
        ...claim("c3", ["c3a", "c3b", "c3c"]),
      ],
    };
    const i = integrity(g);
    expect(i).toBeCloseTo(51.2, 1);
    expect(i).toBeGreaterThan(45); // meaningful, not the ~13% product-AND would crush it to
  });

  // A 5-node-deep chain of 0.8-confidence nodes stays well above 0 (0.8^5 = 0.32768).
  it("a 5-layer chain of 0.8s stays well above zero", () => {
    const g: Graph = {
      thesisId: "n0",
      nodes: [
        { id: "n0", type: "thesis", label: "n0", confidence: 0.8, groups: [{ kind: "AND", childIds: ["n1"] }] },
        { id: "n1", type: "claim", label: "n1", confidence: 0.8, groups: [{ kind: "AND", childIds: ["n2"] }] },
        { id: "n2", type: "claim", label: "n2", confidence: 0.8, groups: [{ kind: "AND", childIds: ["n3"] }] },
        { id: "n3", type: "claim", label: "n3", confidence: 0.8, groups: [{ kind: "AND", childIds: ["n4"] }] },
        { id: "n4", type: "assumption", label: "n4", confidence: 0.8, groups: [] },
      ],
    };
    expect(integrity(g)).toBeCloseTo(32.77, 1);
    expect(integrity(g)).toBeGreaterThan(25);
  });
});
