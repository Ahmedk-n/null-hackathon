import { describe, it, expect } from "vitest";
import { fitCalibration, applyCalibration } from "./calibrate";

const held = (p: number) => ({ predictedPHold: p, outcome: "held" as const });
const failed = (p: number) => ({ predictedPHold: p, outcome: "failed" as const });

describe("fitCalibration", () => {
  it("no data → identity (bias 0)", () => {
    const c = fitCalibration([]);
    expect(c.bias).toBe(0);
    expect(c.sampleCount).toBe(0);
  });
  it("systematic over-holding → negative bias (discounts optimism)", () => {
    // predicted high (0.8) but half actually failed
    const outcomes = [held(0.8), failed(0.8), failed(0.8), held(0.8), failed(0.8), failed(0.8)];
    const c = fitCalibration(outcomes);
    expect(c.bias).toBeLessThan(0);
    const cal = applyCalibration({ pHold: 0.8, mean: 80, band: [60, 90] }, c);
    expect(cal.calibratedPHold).toBeLessThan(0.8);
  });
  it("under-confidence → positive bias", () => {
    const outcomes = [held(0.4), held(0.4), held(0.4), held(0.4), failed(0.4)];
    expect(fitCalibration(outcomes).bias).toBeGreaterThan(0);
  });
  it("shrinks toward identity with fewer samples", () => {
    const strong = [failed(0.8), failed(0.8), failed(0.8), failed(0.8)];
    const weak = [failed(0.8), failed(0.8)];
    expect(Math.abs(fitCalibration(strong).bias)).toBeGreaterThan(Math.abs(fitCalibration(weak).bias));
  });
  it("category rates shrink toward 0.5", () => {
    const c = fitCalibration([
      { predictedPHold: 0.6, outcome: "failed", materializedCategories: ["execution"] },
      { predictedPHold: 0.6, outcome: "failed", materializedCategories: ["execution"] },
    ]);
    expect(c.categoryRates["execution"]).toBeGreaterThan(0.5);
    expect(c.categoryRates["execution"]).toBeLessThan(1);
  });
  it("applyCalibration stays in [0,1] and is identity at bias 0", () => {
    const id = fitCalibration([]);
    const r = applyCalibration({ pHold: 0.62, mean: 62, band: [14, 87] }, id);
    expect(r.calibratedPHold).toBeCloseTo(0.62, 6);
    expect(r.calibratedBand[0]).toBeGreaterThanOrEqual(0);
    expect(r.calibratedBand[1]).toBeLessThanOrEqual(100);
  });
});
