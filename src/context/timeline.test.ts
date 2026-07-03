import { describe, it, expect } from "vitest";
import {
  magnitudeAt,
  adjustmentsAt,
  failsInDays,
  CRATER_THRESHOLD,
  DECAY_WINDOW_DAYS,
} from "./timeline";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureDecisionContextPack,
  fixtureContextGraphB,
  fixtureContextAttacksB,
  fixtureDecisionContextPackB,
} from "./fixtures";
import type { DecisionContextPack } from "./types";

describe("magnitudeAt — temporal decay curve", () => {
  it("is FULL base when the event is <=1 day away", () => {
    expect(magnitudeAt(1, 1)).toBeCloseTo(1, 10);
    expect(magnitudeAt(0, 1)).toBeCloseTo(1, 10); // clamped
    expect(magnitudeAt(-3, 1)).toBeCloseTo(1, 10); // negative → full (clamped)
    expect(magnitudeAt(1, 0.6)).toBeCloseTo(0.6, 10);
  });

  it("is ZERO once the event is >=14 days out", () => {
    expect(magnitudeAt(DECAY_WINDOW_DAYS, 1)).toBeCloseTo(0, 10);
    expect(magnitudeAt(20, 1)).toBeCloseTo(0, 10);
    expect(magnitudeAt(14, 0.9)).toBeCloseTo(0, 10);
  });

  it("decays LINEARLY in between (7.5d out → half)", () => {
    // factor = (14 - 7.5) / 13 = 0.5
    expect(magnitudeAt(7.5, 1)).toBeCloseTo(0.5, 10);
    expect(magnitudeAt(7.5, 0.8)).toBeCloseTo(0.4, 10);
  });

  it("is monotonically non-increasing in daysUntil and clamped to [0,1]", () => {
    let prev = magnitudeAt(0, 1);
    for (let d = 1; d <= 20; d++) {
      const v = magnitudeAt(d, 1);
      expect(v).toBeLessThanOrEqual(prev + 1e-12);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    // base > 1 still clamps to 1
    expect(magnitudeAt(1, 5)).toBe(1);
  });
});

describe("adjustmentsAt — temporal-only day shifting", () => {
  const pack = fixtureDecisionContextPack(); // 4 adjustments, all temporal categories

  it("day 0 zeroes the temporal magnitudes (deadline a fortnight out)", () => {
    const adj = adjustmentsAt(pack, 0);
    expect(adj).toHaveLength(pack.contextWeightAdjustments.length);
    for (const a of adj) expect(a.magnitude).toBeCloseTo(0, 10);
  });

  it("day >=13 restores the full stored magnitudes (deadline imminent)", () => {
    const adj = adjustmentsAt(pack, 13);
    for (let i = 0; i < adj.length; i++) {
      expect(adj[i].magnitude).toBeCloseTo(pack.contextWeightAdjustments[i].magnitude, 10);
      // direction/reason/category untouched
      expect(adj[i].targetCategory).toBe(pack.contextWeightAdjustments[i].targetCategory);
      expect(adj[i].direction).toBe(pack.contextWeightAdjustments[i].direction);
    }
  });

  it("grows monotonically with the day for a temporal adjustment", () => {
    const exec = () =>
      adjustmentsAt(pack, 0).find((a) => a.targetCategory === "execution")!.magnitude;
    expect(exec()).toBeCloseTo(0, 10);
    let prev = -1;
    for (let d = 0; d <= 13; d++) {
      const m = adjustmentsAt(pack, d).find((a) => a.targetCategory === "execution")!.magnitude;
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it("passes NON-temporal (e.g. market) adjustments through UNCHANGED", () => {
    const custom: DecisionContextPack = {
      ...pack,
      contextWeightAdjustments: [
        { targetCategory: "market", direction: "increase", magnitude: 0.55, reason: "x" },
        { targetCategory: "execution", direction: "increase", magnitude: 0.9, reason: "y" },
      ],
    };
    const adj0 = adjustmentsAt(custom, 0);
    const market = adj0.find((a) => a.targetCategory === "market")!;
    const exec = adj0.find((a) => a.targetCategory === "execution")!;
    expect(market.magnitude).toBe(0.55); // time-invariant → unchanged
    expect(exec.magnitude).toBeCloseTo(0, 10); // temporal → scaled to 0 at day 0
  });

  it("never mutates the input pack and is deterministic", () => {
    const before = JSON.parse(JSON.stringify(pack.contextWeightAdjustments));
    const a = adjustmentsAt(pack, 5);
    const b = adjustmentsAt(pack, 5);
    expect(a).toEqual(b);
    expect(pack.contextWeightAdjustments).toEqual(before);
  });
});

describe("failsInDays — the failure horizon", () => {
  it("hero A (grounded) craters below the 10% line at day 8", () => {
    const n = failsInDays(
      fixtureContextGraph(),
      fixtureContextAttacks(),
      fixtureDecisionContextPack(),
      CRATER_THRESHOLD,
    );
    expect(n).toBe(8);
  });

  it("scenario B survives the whole 30-day horizon (null)", () => {
    const n = failsInDays(
      fixtureContextGraphB(),
      fixtureContextAttacksB(),
      fixtureDecisionContextPackB(),
      CRATER_THRESHOLD,
    );
    expect(n).toBeNull();
  });

  it("is deterministic and never mutates the base graph", () => {
    const g = fixtureContextGraph();
    const snapshot = JSON.parse(JSON.stringify(g));
    const a = failsInDays(g, fixtureContextAttacks(), fixtureDecisionContextPack(), CRATER_THRESHOLD);
    const b = failsInDays(g, fixtureContextAttacks(), fixtureDecisionContextPack(), CRATER_THRESHOLD);
    expect(a).toBe(b);
    expect(g).toEqual(snapshot);
  });

  it("a higher threshold fails sooner (day 0 fails when the line clears raw integrity)", () => {
    // Hero A raw integrity ~17%; a 20% line is above it, so it fails from day 0.
    const n = failsInDays(
      fixtureContextGraph(),
      fixtureContextAttacks(),
      fixtureDecisionContextPack(),
      20,
    );
    expect(n).toBe(0);
  });
});
