import { describe, it, expect } from "vitest";
import type { Attack, Graph } from "./types";
import { applyAttacks, detectFailures } from "./load";
import { computeSupport } from "./propagation";

function graph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["a1"] }] },
      { id: "a1", type: "assumption", label: "a1", confidence: 0.8, groups: [] },
    ],
  };
}

describe("applyAttacks", () => {
  it("reduces target confidence by (1 - severity)", () => {
    const attacks: Attack[] = [{ id: "x", targetId: "a1", category: "market", severity: 0.5, rationale: "" }];
    const out = applyAttacks(graph(), attacks);
    expect(out.nodes.find((n) => n.id === "a1")!.confidence).toBeCloseTo(0.4);
  });

  it("compounds multiple attacks on the same target", () => {
    const attacks: Attack[] = [
      { id: "x", targetId: "a1", category: "market", severity: 0.5, rationale: "" },
      { id: "y", targetId: "a1", category: "exec", severity: 0.5, rationale: "" },
    ];
    // 0.8 * 0.5 * 0.5 = 0.2
    expect(applyAttacks(graph(), attacks).nodes.find((n) => n.id === "a1")!.confidence).toBeCloseTo(0.2);
  });

  it("does not mutate the input graph", () => {
    const g = graph();
    applyAttacks(g, [{ id: "x", targetId: "a1", category: "m", severity: 0.9, rationale: "" }]);
    expect(g.nodes.find((n) => n.id === "a1")!.confidence).toBe(0.8);
  });
});

describe("detectFailures", () => {
  it("flags nodes whose support falls below the threshold", () => {
    const attacked = applyAttacks(graph(), [
      { id: "x", targetId: "a1", category: "m", severity: 0.7, rationale: "" },
    ]);
    // a1 -> 0.8 * 0.3 = 0.24 < 0.35 ; T support = 0.24 < 0.35
    const failures = detectFailures(attacked);
    expect(failures.has("a1")).toBe(true);
    expect(failures.has("T")).toBe(true);
    expect(computeSupport(attacked).get("a1")).toBeCloseTo(0.24);
  });
});
