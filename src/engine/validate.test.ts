import { describe, it, expect } from "vitest";
import type { Attack, Graph } from "./types";
import { attacksReferenceIssues, graphReferenceIssues, isGraphWellFormed, validateAttacks } from "./validate";
import { fixtureContextAttacks, fixtureContextGraph } from "@/context/fixtures";
import { fixtureAttacks, fixtureGraph } from "@/llm/fixture";

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

describe("attacksReferenceIssues", () => {
  const g = wellFormed();
  const atk = (targetId: string): Attack => ({ id: `x_${targetId}`, targetId, category: "m", severity: 0.5, rationale: "" });

  it("returns [] when every attack targets an existing node", () => {
    expect(attacksReferenceIssues([atk("a"), atk("T")], g)).toEqual([]);
  });

  it("flags an attack that targets a missing node", () => {
    const issues = attacksReferenceIssues([atk("ghost")], g);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("ghost");
  });
});

describe("validateAttacks", () => {
  const g = wellFormed(); // T (thesis) + a (assumption)
  const good = (targetId: string, over: Partial<Attack> = {}): Attack => ({
    id: `ok_${targetId}`, targetId, category: "execution risk", severity: 0.5, rationale: "why", ...over,
  });

  it("accepts attacks that target existing assumptions", () => {
    const r = validateAttacks(g, [good("a")]);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.validAttacks).toHaveLength(1);
  });

  it("rejects an attack targeting a missing node", () => {
    const r = validateAttacks(g, [good("ghost")]);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toContain("missing node");
  });

  it("rejects an attack targeting a non-assumption node (thesis/claim)", () => {
    const r = validateAttacks(g, [good("T")]);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toContain("non-assumption");
  });

  it("rejects duplicate attack ids", () => {
    const r = validateAttacks(g, [good("a"), good("a")]); // same id ok_a twice
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toContain("duplicate attack id");
  });

  it("rejects non-finite severity and empty rationale", () => {
    const r = validateAttacks(g, [good("a", { id: "x", severity: Number.NaN }), good("a", { id: "y", rationale: "  " })]);
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toContain("non-finite severity");
    expect(r.issues.join(" ")).toContain("empty rationale");
  });

  it("keeps only valid attacks in validAttacks (partial set)", () => {
    const r = validateAttacks(g, [good("a", { id: "keep" }), good("ghost", { id: "drop" })]);
    expect(r.ok).toBe(false);
    expect(r.validAttacks.map((x) => x.id)).toEqual(["keep"]);
  });

  it("both shipped fixtures pass full validation", () => {
    expect(validateAttacks(fixtureContextGraph(), fixtureContextAttacks()).ok).toBe(true);
    expect(validateAttacks(fixtureGraph(), fixtureAttacks()).ok).toBe(true);
  });
});
