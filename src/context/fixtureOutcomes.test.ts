import { describe, it, expect } from "vitest";
import { fitCalibration } from "@/engine/calibrate";
import { fixtureOutcomes } from "./fixtureOutcomes";

describe("fixtureOutcomes", () => {
  it("is non-empty", () => {
    expect(fixtureOutcomes.length).toBeGreaterThan(0);
  });

  it("fits a clearly-negative bias (systematic over-holder) with full sample count", () => {
    const cal = fitCalibration(fixtureOutcomes);
    expect(cal.sampleCount).toBe(fixtureOutcomes.length);
    expect(cal.bias).toBeLessThan(0);
  });
});
