import { describe, it, expect } from "vitest";
import type { Attack } from "@/engine";
import type { ContextWeightAdjustment } from "./types";
import { normaliseCategory, reweightAttacksByContext } from "./weights";

function atk(category: string, severity: number): Attack {
  return { id: "a", targetId: "t", category, severity, rationale: "" };
}

describe("normaliseCategory", () => {
  it("maps 'execution risk' to execution", () => {
    expect(normaliseCategory("execution risk")).toBe("execution");
  });
  it("maps 'second-order' to execution", () => {
    expect(normaliseCategory("second-order")).toBe("execution");
  });
  it("maps 'SLA' to reliability (case-insensitive)", () => {
    expect(normaliseCategory("SLA breach")).toBe("reliability");
  });
  it("maps 'compliance' to auditability", () => {
    expect(normaliseCategory("compliance gap")).toBe("auditability");
  });
  it("returns null for an unclassifiable category", () => {
    expect(normaliseCategory("vibes")).toBeNull();
  });
});

describe("reweightAttacksByContext", () => {
  const inc = (targetCategory: ContextWeightAdjustment["targetCategory"], magnitude: number): ContextWeightAdjustment => ({
    targetCategory,
    direction: "increase",
    magnitude,
    reason: "",
  });
  const dec = (targetCategory: ContextWeightAdjustment["targetCategory"], magnitude: number): ContextWeightAdjustment => ({
    targetCategory,
    direction: "decrease",
    magnitude,
    reason: "",
  });

  it("leaves an unclassifiable category unchanged", () => {
    const out = reweightAttacksByContext([atk("vibes", 0.5)], [inc("execution", 0.8)]);
    expect(out[0].severity).toBe(0.5);
  });

  it("leaves an attack with no matching adjustment unchanged", () => {
    const out = reweightAttacksByContext([atk("execution risk", 0.5)], [inc("market", 0.8)]);
    expect(out[0].severity).toBe(0.5);
  });

  it("raises severity for an increased category", () => {
    // 0.5 * (1 + 0.5*0.8) = 0.5 * 1.4 = 0.7
    const out = reweightAttacksByContext([atk("execution risk", 0.5)], [inc("execution", 0.8)]);
    expect(out[0].severity).toBeCloseTo(0.7);
  });

  it("lowers severity for a decreased category", () => {
    // 0.5 * (1 - 0.5*0.8) = 0.5 * 0.6 = 0.3
    const out = reweightAttacksByContext([atk("execution risk", 0.5)], [dec("execution", 0.8)]);
    expect(out[0].severity).toBeCloseTo(0.3);
  });

  it("uses the highest magnitude when several adjustments match", () => {
    // should pick magnitude 0.8 -> 0.5*1.4 = 0.7
    const out = reweightAttacksByContext(
      [atk("execution risk", 0.5)],
      [inc("execution", 0.2), inc("execution", 0.8), inc("execution", 0.4)],
    );
    expect(out[0].severity).toBeCloseTo(0.7);
  });

  it("clamps severity into [0,1]", () => {
    const high = reweightAttacksByContext([atk("execution risk", 0.9)], [inc("execution", 1)]);
    expect(high[0].severity).toBe(1);
    const low = reweightAttacksByContext([atk("execution risk", 0.1)], [dec("execution", 1)]);
    expect(low[0].severity).toBeGreaterThanOrEqual(0);
  });

  it("does not mutate the input attacks", () => {
    const input = [atk("execution risk", 0.5)];
    reweightAttacksByContext(input, [inc("execution", 0.8)]);
    expect(input[0].severity).toBe(0.5);
  });
});
