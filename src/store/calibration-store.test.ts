// P2-T5 · store wiring for cross-decision calibration. `calibration` is a plain value the store
// holds (never fetches — see the boundary guard); the fetch itself lives in KeystoneApp via
// fetchCalibration (src/lib/library/calibration.ts).
import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectCalibration, selectCalibrationIsSample } from "./useKeystone";
import type { Calibration } from "@/engine/calibrate";

const fakeCalibration = (overrides: Partial<Calibration> = {}): Calibration => ({
  bias: -0.4,
  sampleCount: 12,
  rawHoldRate: 0.5,
  predictedMean: 0.7,
  categoryRates: {},
  ...overrides,
});

describe("keystone store · calibration (P2-T5)", () => {
  it("calibration is null before setCalibration is called", () => {
    const store = createKeystoneStore();
    expect(selectCalibration(store.getState())).toBeNull();
  });

  it("setCalibration then selectCalibration returns it", () => {
    const store = createKeystoneStore();
    const cal = fakeCalibration();
    store.getState().setCalibration(cal);
    expect(selectCalibration(store.getState())).toEqual(cal);
  });

  it("setCalibration(null) clears it back out", () => {
    const store = createKeystoneStore();
    store.getState().setCalibration(fakeCalibration());
    store.getState().setCalibration(null);
    expect(selectCalibration(store.getState())).toBeNull();
  });

  // Phase 2 whole-feature fix (honesty bug): calibrationIsSample defaults false (never
  // mislabelled as a sample before the fetch effect resolves, or when a caller omits the flag),
  // and setCalibration stores whatever the caller passes.
  it("calibrationIsSample defaults to false before setCalibration is called", () => {
    const store = createKeystoneStore();
    expect(selectCalibrationIsSample(store.getState())).toBe(false);
  });

  it("setCalibration(cal) with no isSample argument keeps calibrationIsSample false", () => {
    const store = createKeystoneStore();
    store.getState().setCalibration(fakeCalibration());
    expect(selectCalibrationIsSample(store.getState())).toBe(false);
  });

  it("setCalibration(cal, true) marks it as a sample; setCalibration(cal, false) clears that back", () => {
    const store = createKeystoneStore();
    store.getState().setCalibration(fakeCalibration(), true);
    expect(selectCalibrationIsSample(store.getState())).toBe(true);
    store.getState().setCalibration(fakeCalibration(), false);
    expect(selectCalibrationIsSample(store.getState())).toBe(false);
  });
});
