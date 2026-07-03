import { describe, it, expect } from "vitest";
import { GraphSchema } from "@/llm/schemas";
import {
  applyAttacks,
  detectFailures,
  integrity,
  keystone,
  rankLoadBearing,
} from "@/engine";
import { fixtureContextGraph, fixtureContextAttacks } from "./fixtures";

describe("context hero fixture", () => {
  it("produces a graph that validates against GraphSchema", () => {
    expect(() => GraphSchema.parse(fixtureContextGraph())).not.toThrow();
  });

  it("has a healthy baseline integrity (~62%)", () => {
    expect(integrity(fixtureContextGraph())).toBeCloseTo(61.97, 1);
  });

  it("has k_credible as a strictly dominant keystone", () => {
    const g = fixtureContextGraph();
    expect(keystone(g)?.id).toBe("k_credible");
    const ranked = rankLoadBearing(g);
    const top = ranked[0];
    const next = ranked[1];
    expect(top.id).toBe("k_credible");
    // strict dominance: keystone impact >= 5x the next assumption's
    expect(top.impact).toBeGreaterThanOrEqual(5 * next.impact);
  });

  it("craters under load with a partial collapse (c_roi holds)", () => {
    const attacked = applyAttacks(fixtureContextGraph(), fixtureContextAttacks());
    expect(integrity(attacked)).toBeLessThan(10);
    const failures = detectFailures(attacked);
    expect(failures.has("T")).toBe(true);
    expect(failures.has("c_exec")).toBe(true);
    expect(failures.has("c_reliab")).toBe(true);
    expect(failures.has("k_credible")).toBe(true);
    expect(failures.has("c_roi")).toBe(false);
  });
});
