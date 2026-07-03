import { describe, it, expect } from "vitest";
import type { Attack } from "@/engine";
import type { ContextWeightAdjustment } from "./types";
import { normaliseCategory, reweightAttacksByContext } from "./weights";

const execIncrease: ContextWeightAdjustment[] = [
  { targetCategory: "execution", direction: "increase", magnitude: 0.5, reason: "" },
];

function attack(category: string, severity: number): Attack {
  return { id: "a", targetId: "n", category, severity, rationale: "" };
}

describe("normaliseCategory", () => {
  it("maps free strings to a WeightCategory by keyword", () => {
    expect(normaliseCategory("execution risk")).toBe("execution");
    expect(normaliseCategory("second-order")).toBe("execution");
    expect(normaliseCategory("reliability")).toBe("reliability");
    expect(normaliseCategory("regulatory audit")).toBe("auditability");
  });

  it("returns null for an unclassifiable category", () => {
    expect(normaliseCategory("banana")).toBeNull();
  });
});

describe("reweightAttacksByContext", () => {
  it("an execution increase strictly raises an execution attack's severity", () => {
    const [out] = reweightAttacksByContext([attack("execution risk", 0.5)], execIncrease);
    // 0.5 * (1 + 0.5 * 0.5) = 0.625
    expect(out.severity).toBeCloseTo(0.625);
    expect(out.severity).toBeGreaterThan(0.5);
  });

  it("leaves an unclassifiable category unchanged", () => {
    const input = [attack("banana", 0.5)];
    const [out] = reweightAttacksByContext(input, execIncrease);
    expect(out.severity).toBe(0.5);
  });

  it("leaves an attack unchanged when no adjustment matches its category", () => {
    // "market" attack, but only an execution adjustment is present
    const [out] = reweightAttacksByContext([attack("market demand", 0.5)], execIncrease);
    expect(out.severity).toBe(0.5);
  });

  it("clamps the resulting severity at 1", () => {
    const bigIncrease: ContextWeightAdjustment[] = [
      { targetCategory: "execution", direction: "increase", magnitude: 1, reason: "" },
    ];
    // 0.9 * (1 + 0.5 * 1) = 1.35 -> clamped to 1
    const [out] = reweightAttacksByContext([attack("execution risk", 0.9)], bigIncrease);
    expect(out.severity).toBe(1);
  });

  it("does not mutate the input attacks", () => {
    const input = [attack("execution risk", 0.5)];
    reweightAttacksByContext(input, execIncrease);
    expect(input[0].severity).toBe(0.5);
  });
});
