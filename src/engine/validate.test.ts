import { describe, it, expect } from "vitest";
import type { Graph } from "./types";
import { graphReferenceIssues, isGraphWellFormed } from "./validate";

function wellFormed(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["a"] }] },
      { id: "a", type: "assumption", label: "a", confidence: 0.5, groups: [] },
    ],
  };
}

describe("graphReferenceIssues", () => {
  it("returns [] for a well-formed graph", () => {
    expect(graphReferenceIssues(wellFormed())).toEqual([]);
    expect(isGraphWellFormed(wellFormed())).toBe(true);
  });

  it("flags a dangling childId", () => {
    const g = wellFormed();
    g.nodes[0].groups[0].childIds = ["ghost"];
    const issues = graphReferenceIssues(g);
    expect(issues.some((i) => i.includes("ghost"))).toBe(true);
    expect(isGraphWellFormed(g)).toBe(false);
  });

  it("flags a missing thesis id", () => {
    const g = wellFormed();
    g.thesisId = "nope";
    expect(graphReferenceIssues(g).some((i) => i.includes("nope"))).toBe(true);
  });

  it("flags duplicate node ids", () => {
    const g = wellFormed();
    g.nodes.push({ id: "a", type: "assumption", label: "dup", confidence: 0.5, groups: [] });
    expect(graphReferenceIssues(g).some((i) => i.includes("duplicate"))).toBe(true);
  });

  it("flags an empty graph", () => {
    expect(graphReferenceIssues({ thesisId: "T", nodes: [] }).length).toBeGreaterThan(0);
  });
});
