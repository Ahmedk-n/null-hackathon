import { describe, it, expect } from "vitest";
import type { Graph } from "./types";
import { keystone, rankLoadBearing } from "./sensitivity";

// a2 is the sole-path load-bearing assumption: A can survive on a1 OR a2, but B needs a2,
// so knocking a2 kills the thesis while a1 is covered by the OR alternative. Under the engine's
// product-AND / max-OR aggregation this makes a2 STRICTLY dominant (a genuine impact gap, not a
// tie). NOTE (deviation): the base plan's original graph (A = AND(a1,a2)) produces an impact TIE
// under product-AND — knocking either leaf zeros the AND-thesis — so its `a2 > a1` assertion could
// not hold against the faithful engine. Graph adjusted here so the documented intent holds truthfully.
function graph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["A", "B"] }] },
      { id: "A", type: "claim", label: "A", confidence: 1, groups: [{ kind: "OR", childIds: ["a1", "a2"] }] },
      { id: "B", type: "claim", label: "B", confidence: 1, groups: [{ kind: "AND", childIds: ["a2"] }] },
      { id: "a1", type: "assumption", label: "a1", confidence: 0.9, groups: [] },
      { id: "a2", type: "assumption", label: "a2 (shared)", confidence: 0.9, groups: [] },
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
