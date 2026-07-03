import { describe, it, expect } from "vitest";
import type { Graph } from "./types";
import { cloneGraph, keystone, rankLoadBearing } from "./sensitivity";

// Under product-AND, an assumption is only STRICTLY load-bearing if it sits on a
// path with no OR fallback. Here A can fall back to a1 OR a2, but B strictly
// requires a2 (AND), so knocking a2 is fatal while knocking a1 is harmless.
function graph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["A", "B"] }] },
      { id: "A", type: "claim", label: "A", confidence: 1, groups: [{ kind: "OR", childIds: ["a1", "a2"] }] },
      { id: "B", type: "claim", label: "B", confidence: 1, groups: [{ kind: "AND", childIds: ["a2"] }] },
      { id: "a1", type: "assumption", label: "a1", confidence: 0.9, groups: [] },
      { id: "a2", type: "assumption", label: "a2 (shared, load-bearing)", confidence: 0.9, groups: [] },
    ],
  };
}

describe("rankLoadBearing", () => {
  it("returns only assumptions, sorted by impact descending", () => {
    const ranked = rankLoadBearing(graph());
    expect(ranked.map((r) => r.id)).toEqual(["a2", "a1"]);
    expect(ranked[0].impact).toBeGreaterThan(ranked[1].impact);
  });

  it("does not mutate the input graph", () => {
    const g = graph();
    const before = g.nodes.find((n) => n.id === "a2")!.confidence;
    rankLoadBearing(g);
    expect(g.nodes.find((n) => n.id === "a2")!.confidence).toBe(before);
  });

  it("breaks impact ties deterministically by id ascending", () => {
    // two independent assumptions with identical impact; ids b before a? -> sorted a,b
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "OR", childIds: ["zeb", "alp"] }] },
        { id: "zeb", type: "assumption", label: "z", confidence: 0.5, groups: [] },
        { id: "alp", type: "assumption", label: "a", confidence: 0.5, groups: [] },
      ],
    };
    // OR(max) -> knocking either leaves the other at 0.5, so both impacts are 0 (tie)
    const ranked = rankLoadBearing(g);
    expect(ranked.map((r) => r.id)).toEqual(["alp", "zeb"]);
  });
});

describe("keystone", () => {
  it("is the highest-impact assumption", () => {
    expect(keystone(graph())?.id).toBe("a2");
  });

  it("is null when there are no assumptions", () => {
    const g: Graph = { thesisId: "T", nodes: [{ id: "T", type: "thesis", label: "d", confidence: 1, groups: [] }] };
    expect(keystone(g)).toBeNull();
  });
});

describe("cloneGraph", () => {
  it("deep-clones nodes and groups (no shared references)", () => {
    const g = graph();
    const c = cloneGraph(g);
    c.nodes[0].groups[0].childIds.push("X");
    c.nodes[0].confidence = 0;
    expect(g.nodes[0].groups[0].childIds).not.toContain("X");
    expect(g.nodes[0].confidence).toBe(1);
  });
});
