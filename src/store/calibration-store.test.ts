// P2-T5 · store wiring for cross-decision calibration. `calibration` is a plain value the store
// holds (never fetches — see the boundary guard); the fetch itself lives in KeystoneApp via
// fetchCalibration (src/lib/library/calibration.ts).
import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectCalibration } from "./useKeystone";
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
});
