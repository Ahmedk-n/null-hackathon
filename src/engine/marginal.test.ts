import { describe, it, expect } from "vitest";
import type { Attack, Graph } from "./types";
import { integrity, FAILURE_THRESHOLD } from "./propagation";
import { applyAttacks } from "./load";
import { rankLoadBearing } from "./sensitivity";
import { minimalReinforcement } from "./reinforce";
import { marginalReinforcement } from "./marginal";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureDecisionContextPack,
} from "@/context";
import { reweightAttacksByContext } from "@/context/weights";

const THRESHOLD = FAILURE_THRESHOLD * 100; // 35 on the 0..100 integrity scale

// Grounded (context-reweighted) effective attacks, exactly as the store computes them.
function groundedAttacksA(): Attack[] {
  return reweightAttacksByContext(
    fixtureContextAttacks(),
    fixtureDecisionContextPack().contextWeightAdjustments,
  );
}

describe("marginalReinforcement — hero A (grounded, collapses)", () => {
  it("ranks by firm-up payoff descending, with a non-negative gain per assumption", () => {
    const gains = marginalReinforcement(fixtureContextGraph(), groundedAttacksA(), THRESHOLD);
    expect(gains.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i - 1].gain).toBeGreaterThanOrEqual(gains[i].gain);
    }
    for (const g of gains) expect(g.gain).toBeGreaterThanOrEqual(0);
  });

  it("names the keystone as the single highest-payoff assumption to firm up", () => {
    const base = fixtureContextGraph();
    const attacks = groundedAttacksA();
    const gains = marginalReinforcement(base, attacks, THRESHOLD);
    // The knock-out keystone on the healthy graph is the most load-bearing assumption —
    // restoring it on the attacked graph must buy back the most integrity.
    const keystoneId = rankLoadBearing(base)[0].id;
    expect(gains[0].id).toBe(keystoneId);
    // Its restore is strictly better than the next best (dominance is meaningful, not a tie).
    expect(gains[0].gain).toBeGreaterThan(gains[1].gain);
  });

  it("agrees with the minimal-reinforcement solver: the top gain alone crosses the line", () => {
    const base = fixtureContextGraph();
    const attacks = groundedAttacksA();
    const plan = minimalReinforcement(base, attacks, THRESHOLD);
    // Hero A: the plan is a single assumption (the keystone). Restoring that one alone in the
    // marginal view must also cross the threshold, and gain = integrityAfter − integrityBefore.
    expect(plan.targetIds.length).toBe(1);
    const gains = marginalReinforcement(base, attacks, THRESHOLD);
    const top = gains.find((g) => g.id === plan.targetIds[0])!;
    expect(top.crossesThreshold).toBe(true);
    const before = integrity(applyAttacks(base, attacks));
    expect(top.integrityAfter - before).toBeCloseTo(top.gain, 6);
    expect(top.integrityAfter).toBeGreaterThanOrEqual(THRESHOLD);
  });
});

describe("marginalReinforcement — purity & determinism", () => {
  it("returns byte-identical results across runs and does not mutate the input", () => {
    const base = fixtureContextGraph();
    const attacks = groundedAttacksA();
    const keyBefore = base.nodes.find((n) => n.type === "assumption")!.confidence;
    const a = marginalReinforcement(base, attacks, THRESHOLD);
    const b = marginalReinforcement(base, attacks, THRESHOLD);
    expect(a).toEqual(b);
    expect(base.nodes.find((n) => n.type === "assumption")!.confidence).toBe(keyBefore);
  });

  it("gives an un-attacked assumption zero gain and ranks it last", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "d", confidence: 1, groups: [{ kind: "AND", childIds: ["c"] }] },
        { id: "c", type: "claim", label: "c", confidence: 1, groups: [{ kind: "AND", childIds: ["hit", "safe"] }] },
        { id: "hit", type: "assumption", label: "hit", confidence: 0.9, groups: [] },
        { id: "safe", type: "assumption", label: "safe", confidence: 0.9, groups: [] },
      ],
    };
    const attacks: Attack[] = [
      { id: "a1", targetId: "hit", category: "execution", severity: 0.8, rationale: "x" },
    ];
    const gains = marginalReinforcement(g, attacks, THRESHOLD);
    const hit = gains.find((x) => x.id === "hit")!;
    const safe = gains.find((x) => x.id === "safe")!;
    expect(hit.gain).toBeGreaterThan(0);
    expect(safe.gain).toBe(0);
    // Descending order → the zero-gain assumption is last.
    expect(gains[gains.length - 1].id).toBe("safe");
  });
});
