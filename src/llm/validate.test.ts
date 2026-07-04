import { describe, it, expect } from "vitest";
import type { Attack, Graph, GraphNode } from "@/engine";
import { validateGraph, validateAttacks, validateManualEdit } from "./validate";

/** Thesis `t` with one AND group over `count` leaf assumptions a1..aN. Total nodes = count + 1. */
function makeGraph(count: number): Graph {
  const assumptions: GraphNode[] = Array.from({ length: count }, (_, i) => ({
    id: `a${i + 1}`,
    type: "assumption",
    label: `assumption ${i + 1}`,
    confidence: 0.8,
    groups: [],
  }));
  const thesis: GraphNode = {
    id: "t",
    type: "thesis",
    label: "thesis",
    confidence: 0.9,
    groups: [{ kind: "AND", childIds: assumptions.map((a) => a.id) }],
  };
  return { thesisId: "t", nodes: [thesis, ...assumptions] };
}

describe("validateGraph — structural rejects", () => {
  it("rejects a graph with two theses (null)", () => {
    const g = makeGraph(5);
    g.nodes[1].type = "thesis";
    expect(validateGraph(g)).toBeNull();
  });

  it("rejects a graph with zero theses (null)", () => {
    const g = makeGraph(5);
    g.nodes[0].type = "claim";
    expect(validateGraph(g)).toBeNull();
  });

  it("rejects when thesisId does not point at the thesis node (null)", () => {
    const g = makeGraph(5);
    g.thesisId = "a1";
    expect(validateGraph(g)).toBeNull();
  });

  it("rejects a cycle (null) instead of letting the engine throw", () => {
    const g = makeGraph(5);
    // a1 points back up to the thesis → cycle t -> a1 -> t
    g.nodes[1].groups = [{ kind: "AND", childIds: ["t"] }];
    expect(validateGraph(g)).toBeNull();
  });

  it("rejects too few nodes (4 → null)", () => {
    const g = makeGraph(3); // thesis + 3 = 4 nodes
    expect(validateGraph(g)).toBeNull();
  });

  it("rejects too many nodes (23 all reachable → null)", () => {
    const g = makeGraph(22); // thesis + 22 = 23 nodes (> NODE_MAX 22)
    expect(validateGraph(g)).toBeNull();
  });

  it("rejects when the thesis loses all groups after orphan repair (null)", () => {
    const g = makeGraph(5);
    // Thesis's only group references nothing real → dropped → thesis has no groups.
    g.nodes[0].groups = [{ kind: "AND", childIds: ["ghost1", "ghost2"] }];
    expect(validateGraph(g)).toBeNull();
  });
});

describe("validateGraph — repairs", () => {
  it("drops orphan childIds and keeps the graph valid", () => {
    const g = makeGraph(5); // 6 nodes
    g.nodes[0].groups = [{ kind: "AND", childIds: ["a1", "a2", "a3", "a4", "a5", "ghost"] }];
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    expect(out!.nodes[0].groups[0].childIds).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(out!.nodes[0].groups[0].childIds).not.toContain("ghost");
  });

  it("drops an unreachable node (repair)", () => {
    const g = makeGraph(5); // 6 reachable nodes
    // Add an extra node not referenced by anything → unreachable, should be dropped.
    g.nodes.push({ id: "orphan", type: "assumption", label: "x", confidence: 0.5, groups: [] });
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    expect(out!.nodes.map((n) => n.id)).not.toContain("orphan");
    expect(out!.nodes).toHaveLength(6);
  });

  it("dropping an unreachable node brings 13 → 12 → valid", () => {
    const g = makeGraph(11); // thesis + 11 = 12 reachable nodes
    // 13th node, unreachable → dropped → back to 12 → passes the count band.
    g.nodes.push({ id: "orphan", type: "assumption", label: "x", confidence: 0.5, groups: [] });
    expect(g.nodes).toHaveLength(13);
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    expect(out!.nodes).toHaveLength(12);
    expect(out!.nodes.map((n) => n.id)).not.toContain("orphan");
  });

  it("clamps confidences to [0,1] (repair)", () => {
    const g = makeGraph(5);
    g.nodes[0].confidence = 1.5;
    g.nodes[1].confidence = -0.2;
    g.nodes[2].confidence = Number.NaN;
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    expect(out!.nodes[0].confidence).toBe(1);
    expect(out!.nodes[1].confidence).toBe(0);
    expect(out!.nodes[2].confidence).toBe(0);
  });

  it("never mutates the input graph", () => {
    const g = makeGraph(5);
    g.nodes[0].confidence = 1.5;
    g.nodes[0].groups = [{ kind: "AND", childIds: ["a1", "a2", "a3", "a4", "a5", "ghost"] }];
    const snapshot = JSON.parse(JSON.stringify(g));
    validateGraph(g);
    expect(g).toEqual(snapshot);
  });

  it("returns a deep copy for a valid graph (deep-equal, not same reference)", () => {
    const g = makeGraph(5);
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    expect(out).toEqual(g);
    expect(out).not.toBe(g);
    expect(out!.nodes).not.toBe(g.nodes);
    expect(out!.nodes[0]).not.toBe(g.nodes[0]);
    expect(out!.nodes[0].groups).not.toBe(g.nodes[0].groups);
  });
});

describe("validateAttacks", () => {
  const graph = makeGraph(5); // assumptions a1..a5

  function attack(over: Partial<Attack>): Attack {
    return {
      id: "atk",
      targetId: "a1",
      category: "execution risk",
      severity: 0.5,
      rationale: "",
      ...over,
    };
  }

  it("drops attacks whose target is not an assumption node", () => {
    const attacks = [
      attack({ id: "x", targetId: "t" }), // thesis, not an assumption → dropped
      attack({ id: "y", targetId: "ghost" }), // unknown → dropped
      attack({ id: "z", targetId: "a1" }), // valid
    ];
    const out = validateAttacks(graph, attacks);
    expect(out).not.toBeNull();
    expect(out!.map((a) => a.id)).toEqual(["z"]);
  });

  it("clamps severity to [0,1] then caps raw at 0.6", () => {
    const out = validateAttacks(graph, [
      attack({ id: "hi", targetId: "a1", severity: 0.95 }),
      attack({ id: "over", targetId: "a2", severity: 5 }),
      attack({ id: "neg", targetId: "a3", severity: -3 }),
    ]);
    expect(out).not.toBeNull();
    const byId = new Map(out!.map((a) => [a.id, a.severity]));
    expect(byId.get("hi")).toBe(0.6);
    expect(byId.get("over")).toBe(0.6);
    expect(byId.get("neg")).toBe(0);
  });

  it("keeps only the strongest attack per target", () => {
    const out = validateAttacks(graph, [
      attack({ id: "weak", targetId: "a1", severity: 0.2 }),
      attack({ id: "strong", targetId: "a1", severity: 0.55 }),
      attack({ id: "mid", targetId: "a1", severity: 0.4 }),
    ]);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    expect(out![0].id).toBe("strong");
    expect(out![0].severity).toBeCloseTo(0.55);
  });

  it("rejects when no surviving category normalises to a WeightCategory (null)", () => {
    const out = validateAttacks(graph, [
      attack({ id: "b", targetId: "a1", category: "banana", severity: 0.5 }),
      attack({ id: "q", targetId: "a2", category: "qux nonsense", severity: 0.5 }),
    ]);
    expect(out).toBeNull();
  });

  it("returns null when everything is dropped (empty result)", () => {
    const out = validateAttacks(graph, [attack({ id: "x", targetId: "ghost" })]);
    expect(out).toBeNull();
  });

  it("passes valid attacks through as copies (does not mutate input)", () => {
    const input = [attack({ id: "z", targetId: "a1", severity: 0.9 })];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = validateAttacks(graph, input);
    expect(out).not.toBeNull();
    expect(out![0]).not.toBe(input[0]); // copy, not same reference
    expect(input).toEqual(snapshot); // original untouched (still severity 0.9)
    expect(out![0].severity).toBe(0.6); // capped copy
  });
});

describe("validateManualEdit — relaxed node-count band (V5-3, 3..25)", () => {
  it("accepts a 3-node graph the LLM wall rejects (below the 5 min)", () => {
    const g = makeGraph(2); // thesis + 2 = 3 nodes
    expect(validateGraph(g)).toBeNull(); // LLM band 5..12
    expect(validateManualEdit(g)).not.toBeNull(); // manual band 3..25
  });

  it("accepts a 4-node graph the LLM wall rejects", () => {
    const g = makeGraph(3); // 4 nodes
    expect(validateGraph(g)).toBeNull();
    expect(validateManualEdit(g)).not.toBeNull();
  });

  it("rejects fewer than 3 nodes", () => {
    const g = makeGraph(1); // 2 nodes
    expect(validateManualEdit(g)).toBeNull();
  });

  it("accepts up to 25 nodes the LLM wall rejects (over 12)", () => {
    const g = makeGraph(24); // 25 nodes
    expect(validateGraph(g)).toBeNull();
    const out = validateManualEdit(g);
    expect(out).not.toBeNull();
    expect(out!.nodes).toHaveLength(25);
  });

  it("rejects more than 25 nodes", () => {
    const g = makeGraph(25); // 26 nodes
    expect(validateManualEdit(g)).toBeNull();
  });

  it("keeps every non-count rule identical (two-thesis → null, cycle → null, orphan repaired)", () => {
    const twoTheses = makeGraph(4);
    twoTheses.nodes[1].type = "thesis";
    expect(validateManualEdit(twoTheses)).toBeNull();

    const cyclic = makeGraph(4);
    cyclic.nodes[1].groups = [{ kind: "AND", childIds: ["t"] }];
    expect(validateManualEdit(cyclic)).toBeNull();

    const orphaned = makeGraph(4);
    orphaned.nodes.push({ id: "loose", type: "assumption", label: "x", confidence: 0.5, groups: [] });
    const repaired = validateManualEdit(orphaned);
    expect(repaired).not.toBeNull();
    expect(repaired!.nodes.map((n) => n.id)).not.toContain("loose");
  });

  it("preserves human-edit provenance through the manual-edit repair path", () => {
    const g = makeGraph(3);
    g.nodes[1].provenance = "modified";
    const out = validateManualEdit(g);
    expect(out).not.toBeNull();
    expect(out!.nodes.find((n) => n.id === "a1")!.provenance).toBe("modified");
  });
});

describe("validateGraph — explicit opts override the caps", () => {
  it("honours a custom min/max band", () => {
    const g = makeGraph(2); // 3 nodes
    expect(validateGraph(g, { minNodes: 3, maxNodes: 25 })).not.toBeNull();
    expect(validateGraph(g, { minNodes: 5, maxNodes: 12 })).toBeNull();
  });
});

describe("validateGraph — evidence provenance (V3-6 · V7-4 multi-citation) survives repair", () => {
  it("preserves an assumption's evidence ARRAY (with stance) through the deep-copy repair path", () => {
    const g = makeGraph(5);
    g.nodes[1].evidence = [
      { source: "pyproject.toml", fact: "FastAPI monolith (Python).", stance: "supports" },
      { source: "src/", fact: "No tracing wiring found.", stance: "contradicts" },
    ];
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    const a1 = out!.nodes.find((n) => n.id === "a1")!;
    expect(a1.evidence).toEqual([
      { source: "pyproject.toml", fact: "FastAPI monolith (Python).", stance: "supports" },
      { source: "src/", fact: "No tracing wiring found.", stance: "contradicts" },
    ]);
    // deep copy, not the same reference
    expect(a1.evidence).not.toBe(g.nodes[1].evidence);
  });

  it("BACKWARD-COMPAT: coerces a lone {source,fact} object into a 1-element array", () => {
    const g = makeGraph(5);
    // A legacy / single-evidence value reaching the wall un-coerced (bypasses the schema).
    (g.nodes[1] as { evidence?: unknown }).evidence = {
      source: "pyproject.toml",
      fact: "FastAPI monolith (Python).",
    };
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    const a1 = out!.nodes.find((n) => n.id === "a1")!;
    expect(a1.evidence).toEqual([{ source: "pyproject.toml", fact: "FastAPI monolith (Python)." }]);
  });

  it("preserves an explicit null evidence (ungrounded assumption)", () => {
    const g = makeGraph(5);
    g.nodes[2].evidence = null;
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    expect(out!.nodes.find((n) => n.id === "a2")!.evidence).toBeNull();
  });

  it("leaves evidence undefined when absent (frozen fixture.ts graphs have none)", () => {
    const g = makeGraph(5);
    const out = validateGraph(g);
    expect(out).not.toBeNull();
    for (const n of out!.nodes) expect(n.evidence).toBeUndefined();
  });

  it("does not mutate the input graph's evidence", () => {
    const g = makeGraph(5);
    g.nodes[1].evidence = [{ source: "notes", fact: "meeting tomorrow" }];
    const snapshot = JSON.parse(JSON.stringify(g));
    validateGraph(g);
    expect(g).toEqual(snapshot);
  });
});
