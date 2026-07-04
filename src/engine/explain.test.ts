import { describe, it, expect } from "vitest";
import type { Graph } from "./types";
import { explainKeystone, summariseLoadResult, supportBreakdown } from "./explain";
import { fixtureContextGraph, fixtureContextAttacks, fixtureDecisionContextPack } from "@/context/fixtures";
import { reweightAttacksByContext } from "@/context/weights";

// small known graph: T = conf(1) * AND(k=0.9) * OR(max(0.5,0.8)=0.8) = 0.72
function mixed(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["k"] }, { kind: "OR", childIds: ["p", "q"] }] },
      { id: "k", type: "assumption", label: "k", confidence: 0.9, groups: [] },
      { id: "p", type: "assumption", label: "p", confidence: 0.5, groups: [] },
      { id: "q", type: "assumption", label: "q", confidence: 0.8, groups: [] },
    ],
  };
}

describe("supportBreakdown", () => {
  it("decomposes group values and dependency factor (AND=product, OR=max)", () => {
    const bd = supportBreakdown(mixed());
    const t = bd.nodes.find((n) => n.id === "T")!;
    expect(t.groups[0]).toMatchObject({ kind: "AND", value: 0.9 });
    expect(t.groups[1]).toMatchObject({ kind: "OR", value: 0.8 });
    expect(t.dependencyFactor).toBeCloseTo(0.72);
    expect(t.support).toBeCloseTo(0.72);
    expect(bd.integrity).toBeCloseTo(72);
  });

  it("reports support and failed flag per node on the hero fixture", () => {
    const bd = supportBreakdown(fixtureContextGraph());
    expect(bd.integrity).toBeCloseTo(61.97, 1);
    const k = bd.nodes.find((n) => n.id === "k_credible")!;
    expect(k.ownConfidence).toBe(0.9);
    expect(k.support).toBeCloseTo(0.9);
    expect(k.failed).toBe(false); // healthy baseline
  });

  it("passes node evidence/provenance through untouched (engine-inert)", () => {
    const bd = supportBreakdown(fixtureContextGraph());
    // k_credible carries a grounded evidence plate; a_load is explicitly ungrounded (null).
    const k = bd.nodes.find((n) => n.id === "k_credible")!;
    expect(k.evidence).toEqual({
      source: "notes",
      fact: "Credible near-term technical plan needed by the meeting (tomorrow).",
    });
    const aLoad = bd.nodes.find((n) => n.id === "a_load")!;
    expect(aLoad.evidence).toBeNull();
    // No node in the fixture is human-modified, so provenance stays undefined.
    expect(bd.nodes.every((n) => n.provenance === undefined)).toBe(true);
  });

  it("degrades gracefully on an empty graph", () => {
    const bd = supportBreakdown({ thesisId: "T", nodes: [] });
    expect(bd.nodes).toEqual([]);
    expect(bd.integrity).toBe(0);
  });
});

describe("explainKeystone", () => {
  it("identifies the strict keystone with impact ratio and a data-derived sentence", () => {
    const ex = explainKeystone(fixtureContextGraph());
    expect(ex.keystoneId).toBe("k_credible");
    expect(ex.baselineIntegrity).toBeCloseTo(61.97, 1);
    expect(ex.impactRatio).toBeGreaterThanOrEqual(5); // OUR fixture: ratio ≈ 17
    expect(ex.ranked[0].id).toBe("k_credible");
    expect(ex.explanation).toContain("Can explain safe staged migration by meeting");
  });

  it("handles a graph with no assumptions", () => {
    const g: Graph = { thesisId: "T", nodes: [{ id: "T", type: "thesis", label: "d", confidence: 1, groups: [] }] };
    const ex = explainKeystone(g);
    expect(ex.keystoneId).toBeNull();
    expect(ex.impactRatio).toBe(0);
    expect(ex.ranked).toEqual([]);
  });

  it("reports a sole load-bearing assumption with infinite ratio", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["a"] }] },
        { id: "a", type: "assumption", label: "only one", confidence: 0.9, groups: [] },
      ],
    };
    const ex = explainKeystone(g);
    expect(ex.keystoneId).toBe("a");
    expect(ex.nextImpact).toBe(0);
    expect(ex.impactRatio).toBe(Infinity);
    expect(ex.explanation).toContain("while no other assumption is load-bearing");
  });
});

describe("summariseLoadResult", () => {
  // OUR fixtureContextAttacks are RAW (structure SURVIVES the raw assault — only the thesis
  // dips). The hero collapse fires only once the context pack reweights the attacks (tomorrow's
  // meeting → ▲ execution crosses the keystone's threshold). We pin against OUR reweighted
  // numbers: integrity 61.97 → 6.38, keystone + c_exec + c_reliab fail, c_roi holds.
  it("summarises the hero collapse (partial: c_roi holds)", () => {
    const pack = fixtureDecisionContextPack();
    const reweighted = reweightAttacksByContext(fixtureContextAttacks(), pack.contextWeightAdjustments);
    const s = summariseLoadResult(fixtureContextGraph(), reweighted);
    expect(s.baselineIntegrity).toBeCloseTo(61.97, 1);
    expect(s.postLoadIntegrity).toBeLessThan(10);
    expect(s.integrityDrop).toBeGreaterThan(50);
    expect(s.attacksApplied).toBe(4);
    for (const id of ["T", "c_exec", "c_reliab", "k_credible"]) expect(s.failedNodeIds).toContain(id);
    expect(s.holdingNodeIds).toContain("c_roi");
    expect(s.failedNodeIds).not.toContain("c_roi");
    expect(s.keystoneBeforeLoad).toBe("k_credible");
    // k_credible remains the most load-bearing node even after the collapse
    expect(s.keystoneAfterLoad).toBe("k_credible");
  });

  it("survives the RAW assault (context ignored → only the thesis dips)", () => {
    // Pins the OTHER half of the discrimination story: identical attacks, NO reweighting →
    // integrity ≈ 17%, keystone + claims all HOLD (this is why grounding-in-context matters).
    const s = summariseLoadResult(fixtureContextGraph(), fixtureContextAttacks());
    expect(s.postLoadIntegrity).toBeCloseTo(18.04, 1);
    expect(s.failedNodeIds).toEqual(["T"]);
    for (const id of ["k_credible", "c_exec", "c_reliab", "c_roi"]) expect(s.holdingNodeIds).toContain(id);
  });

  it("does not mutate the input graph", () => {
    const g = fixtureContextGraph();
    const before = g.nodes.find((n) => n.id === "k_credible")!.confidence;
    summariseLoadResult(g, fixtureContextAttacks());
    expect(g.nodes.find((n) => n.id === "k_credible")!.confidence).toBe(before);
  });
});
