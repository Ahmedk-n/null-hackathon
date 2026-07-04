import { describe, it, expect } from "vitest";
import type { Attack, Graph } from "./types";
import { FAILURE_THRESHOLD, computeSupport } from "./propagation";
import { applyAttacks, detectFailures } from "./load";
import { failureCascade } from "./cascade";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureDecisionContextPack,
  fixtureContextGraphR,
  fixtureContextAttacksR,
  fixtureDecisionContextPackR,
} from "@/context";
import { reweightAttacksByContext } from "@/context/weights";

function grounded(attacks: Attack[], pack: { contextWeightAdjustments: Parameters<typeof reweightAttacksByContext>[1] }): Attack[] {
  return reweightAttacksByContext(attacks, pack.contextWeightAdjustments);
}
function groundedAttacksA(): Attack[] {
  return grounded(fixtureContextAttacks(), fixtureDecisionContextPack());
}
function groundedAttacksR(): Attack[] {
  return grounded(fixtureContextAttacksR(), fixtureDecisionContextPackR());
}

describe("failureCascade — hero A (grounded, collapses)", () => {
  const base = fixtureContextGraph();
  const attacks = groundedAttacksA();

  it("orders failed nodes lowest-support-first", () => {
    const cascade = failureCascade(base, attacks);
    expect(cascade.length).toBeGreaterThan(0);
    for (let i = 1; i < cascade.length; i++) {
      expect(cascade[i - 1].support).toBeLessThanOrEqual(cascade[i].support);
    }
    // cascade[0] is the node that gives way first — the minimum support in the set.
    const minSupport = Math.min(...cascade.map((c) => c.support));
    expect(cascade[0].support).toBeCloseTo(minSupport, 6);
  });

  it("includes exactly the nodes the engine marks failed, all below threshold", () => {
    const cascade = failureCascade(base, attacks);
    for (const step of cascade) expect(step.support).toBeLessThan(FAILURE_THRESHOLD);
    // Same set as detectFailures — cascade only ADDS order, never changes membership.
    const engineFailures = detectFailures(applyAttacks(base, attacks));
    expect(new Set(cascade.map((c) => c.id))).toEqual(engineFailures);
  });

  it("reports the true post-load support for each step", () => {
    const support = computeSupport(applyAttacks(base, attacks));
    for (const step of failureCascade(base, attacks)) {
      expect(step.support).toBeCloseTo(support.get(step.id) ?? -1, 6);
    }
  });
});

describe("failureCascade — scenario R (grounded, partial collapse)", () => {
  it("is a proper subset of the graph — some nodes still hold", () => {
    const base = fixtureContextGraphR();
    const attacks = groundedAttacksR();
    const cascade = failureCascade(base, attacks);
    // R's beat: the keystone cracks but at least one branch holds → not everything fails.
    expect(cascade.length).toBeGreaterThan(0);
    expect(cascade.length).toBeLessThan(base.nodes.length);
    const engineFailures = detectFailures(applyAttacks(base, attacks));
    expect(new Set(cascade.map((c) => c.id))).toEqual(engineFailures);
  });
});

describe("failureCascade — purity, determinism & tiebreak", () => {
  it("returns byte-identical results across runs and does not mutate the input", () => {
    const base = fixtureContextGraph();
    const attacks = groundedAttacksA();
    const confBefore = base.nodes.map((n) => n.confidence);
    const a = failureCascade(base, attacks);
    const b = failureCascade(base, attacks);
    expect(a).toEqual(b);
    expect(base.nodes.map((n) => n.confidence)).toEqual(confBefore);
  });

  it("breaks equal-support ties in dependency order (children before parents)", () => {
    // Thesis and its lone claim both collapse to 0 support (a zeroed leaf zeroes the AND chain),
    // so they tie on support — the leaf/claim must precede the thesis.
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "thesis", confidence: 1, groups: [{ kind: "AND", childIds: ["c"] }] },
        { id: "c", type: "claim", label: "claim", confidence: 1, groups: [{ kind: "AND", childIds: ["a"] }] },
        { id: "a", type: "assumption", label: "assumption", confidence: 0.5, groups: [] },
      ],
    };
    const attacks: Attack[] = [
      { id: "a1", targetId: "a", category: "execution", severity: 1.0, rationale: "obliterated" },
    ];
    const cascade = failureCascade(g, attacks);
    const ids = cascade.map((c) => c.id);
    // All three collapse to support 0 → tiebreak is topological: a (leaf) before c before T.
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("c"));
    expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("T"));
  });
});
