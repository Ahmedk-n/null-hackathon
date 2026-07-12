// Phase 2 whole-feature fix (honesty bug) · fetchCalibration must never hand a signed-in caller
// the offline over-holder fixture as if it were their own record — only guest sessions get the
// fixture, and only guest sessions are ever flagged isSample: true. A signed-in caller always gets
// their REAL record back, even when it's empty (sampleCount 0) or the route is unreachable.
import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchCalibration } from "./calibration";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCalibration — P2 honesty-bug fix", () => {
  it("guest sessions get the offline fixture, flagged isSample: true", async () => {
    const result = await fetchCalibration(true);
    expect(result.isSample).toBe(true);
    expect(result.calibration.sampleCount).toBeGreaterThan(0);
  });

  it("signed-in with a real, non-empty record: passes it through, isSample: false", async () => {
    const real = {
      bias: -0.3,
      sampleCount: 6,
      rawHoldRate: 0.5,
      predictedMean: 0.7,
      categoryRates: {},
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ calibration: real }) })),
    );
    const result = await fetchCalibration(false);
    expect(result).toEqual({ calibration: real, isSample: false });
  });

  it("signed-in with a real but EMPTY record (sampleCount 0): kept as-is, NEVER the fixture", async () => {
    const empty = { bias: 0, sampleCount: 0, rawHoldRate: 0, predictedMean: 0, categoryRates: {} };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ calibration: empty }) })),
    );
    const result = await fetchCalibration(false);
    expect(result).toEqual({ calibration: empty, isSample: false });
    // Never fabricate — the fixture always has a non-zero sample count, so this also rules out
    // an accidental fixture substitution.
    expect(result.calibration.sampleCount).toBe(0);
  });

  it("signed-in with a non-OK response: falls back to an empty REAL record, not the fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => null })),
    );
    const result = await fetchCalibration(false);
    expect(result.isSample).toBe(false);
    expect(result.calibration.sampleCount).toBe(0);
  });

  it("signed-in with a network failure: falls back to an empty REAL record, not the fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const result = await fetchCalibration(false);
    expect(result.isSample).toBe(false);
    expect(result.calibration.sampleCount).toBe(0);
  });

  it("signed-in with an unparseable/missing body: falls back to an empty REAL record, not the fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      })),
    );
    const result = await fetchCalibration(false);
    expect(result.isSample).toBe(false);
    expect(result.calibration.sampleCount).toBe(0);
  });
});
