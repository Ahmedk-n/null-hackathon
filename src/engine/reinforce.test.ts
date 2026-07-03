import { describe, it, expect } from "vitest";
import type { Attack, Graph } from "./types";
import { integrity } from "./propagation";
import { minimalReinforcement } from "./reinforce";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureDecisionContextPack,
  fixtureContextGraphB,
  fixtureContextAttacksB,
  fixtureDecisionContextPackB,
} from "@/context";
import { reweightAttacksByContext } from "@/context/weights";

// The store threshold: FAILURE_THRESHOLD (0.35) expressed at the 0..100 integrity scale.
const THRESHOLD = 35;

// Grounded (context-reweighted) effective attacks, exactly as the store computes them.
function groundedAttacksA(): Attack[] {
  return reweightAttacksByContext(
    fixtureContextAttacks(),
    fixtureDecisionContextPack().contextWeightAdjustments,
  );
}
function groundedAttacksB(): Attack[] {
  return reweightAttacksByContext(
    fixtureContextAttacksB(),
    fixtureDecisionContextPackB().contextWeightAdjustments,
  );
}

describe("minimalReinforcement — hero A (grounded, collapses ~6.4%)", () => {
  it("prescribes the minimal set that crosses the failure line", () => {
    const plan = minimalReinforcement(fixtureContextGraph(), groundedAttacksA(), THRESHOLD);

    // Attacked structure is below the line; a fix exists.
    expect(plan.integrityBefore).toBeLessThan(THRESHOLD);
    expect(plan.integrityBefore).toBeCloseTo(6.38, 1);
    expect(plan.reachable).toBe(true);

    // The keystone alone is the cheapest thing to prove.
    expect(plan.targetIds).toEqual(["k_credible"]);
    expect(plan.integrityAfter).toBeGreaterThanOrEqual(THRESHOLD);
    expect(plan.integrityAfter).toBeCloseTo(50.62, 1);
  });

  it("is genuinely minimal — no smaller set survives", () => {
    const base = fixtureContextGraph();
    const attacks = groundedAttacksA();
    const plan = minimalReinforcement(base, attacks, THRESHOLD);

    // Empty set == the attacked graph, which is below threshold, so the plan cannot be empty.
    expect(plan.targetIds.length).toBe(1);
    // Every strict subset (here: the empty set) fails to cross — proven by integrityBefore.
    expect(plan.integrityBefore).toBeLessThan(THRESHOLD);
  });
});

describe("minimalReinforcement — scenario B (grounded, already holds ~47.6%)", () => {
  it("needs no reinforcement", () => {
    const plan = minimalReinforcement(fixtureContextGraphB(), groundedAttacksB(), THRESHOLD);
    expect(plan.integrityBefore).toBeGreaterThanOrEqual(THRESHOLD);
    expect(plan.targetIds).toEqual([]);
    expect(plan.reachable).toBe(true);
    expect(plan.integrityAfter).toBe(plan.integrityBefore);
  });
});

describe("minimalReinforcement — unreachable", () => {
  it("reports reachable=false when even restoring everything can't cross the threshold", () => {
    const base = fixtureContextGraph();
    // Severity-1.0 attacks on every assumption; threshold 99 exceeds the healthy baseline.
    const attacks: Attack[] = base.nodes
      .filter((n) => n.type === "assumption")
      .map((n, i) => ({
        id: `atk_${i}`,
        targetId: n.id,
        category: "execution",
        severity: 1.0,
        rationale: "obliterated",
      }));
    const plan = minimalReinforcement(base, attacks, 99);
    expect(plan.reachable).toBe(false);
    expect(plan.targetIds).toEqual([]);
    // Best achievable = the healthy baseline (all assumptions restored), still < 99.
    expect(plan.integrityAfter).toBeLessThan(99);
    expect(plan.integrityAfter).toBeCloseTo(integrity(base), 5);
  });
});

describe("minimalReinforcement — determinism", () => {
  it("returns byte-identical plans across repeated runs", () => {
    const a = minimalReinforcement(fixtureContextGraph(), groundedAttacksA(), THRESHOLD);
    const b = minimalReinforcement(fixtureContextGraph(), groundedAttacksA(), THRESHOLD);
    expect(a).toEqual(b);
  });

  it("does not mutate the input graph", () => {
    const base = fixtureContextGraph();
    const before = base.nodes.find((n) => n.id === "k_credible")!.confidence;
    minimalReinforcement(base, groundedAttacksA(), THRESHOLD);
    expect(base.nodes.find((n) => n.id === "k_credible")!.confidence).toBe(before);
  });
});

describe("minimalReinforcement — threshold edge", () => {
  it("returns an empty reachable plan when already at/over threshold", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["a"] }] },
        { id: "a", type: "assumption", label: "a", confidence: 0.9, groups: [] },
      ],
    };
    const plan = minimalReinforcement(g, [], THRESHOLD);
    expect(plan.targetIds).toEqual([]);
    expect(plan.reachable).toBe(true);
    expect(plan.integrityBefore).toBeGreaterThanOrEqual(THRESHOLD);
  });
});
