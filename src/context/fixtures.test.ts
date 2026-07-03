import { describe, it, expect } from "vitest";
import { GraphSchema } from "@/llm/schemas";
import {
  applyAttacks,
  detectFailures,
  integrity,
  keystone,
  rankLoadBearing,
} from "@/engine";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureDecisionContextPack,
} from "./fixtures";
import { reweightAttacksByContext } from "./weights";

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

  // ── The differentiator: context flips the OUTCOME ────────────────────
  // RAW = attacks with context IGNORED (unweighted). The structure SURVIVES:
  // the load-bearing keystone and every claim hold above the 0.35 threshold.
  it("RAW attacks (context ignored): keystone HOLDS, structure survives", () => {
    const raw = applyAttacks(fixtureContextGraph(), fixtureContextAttacks());
    const failures = detectFailures(raw);
    // The keystone and all three claims stay above the failure threshold.
    expect(failures.has("k_credible")).toBe(false);
    expect(failures.has("c_exec")).toBe(false);
    expect(failures.has("c_reliab")).toBe(false);
    expect(failures.has("c_roi")).toBe(false);
    // Integrity lands in a stressed-but-standing band (keystone squared caps the
    // ceiling here; see fixtures.ts — this is the "survives" reading).
    const rawIntegrity = integrity(raw);
    expect(rawIntegrity).toBeGreaterThan(15);
    expect(rawIntegrity).toBeLessThan(25);
    expect(rawIntegrity).toBeCloseTo(17.11, 0);
  });

  // REWEIGHTED = the hero pack (tomorrow's enterprise meeting) amplifies the
  // execution attack via the single pure reweightAttacksByContext. NOW the
  // keystone crosses the threshold and the structure craters — a partial
  // collapse (c_roi still holds). Flipping raw⟷reweighted flips survive⟷collapse.
  it("REWEIGHTED attacks (grounded in context): keystone FAILS, partial collapse", () => {
    const pack = fixtureDecisionContextPack();
    const reweighted = reweightAttacksByContext(
      fixtureContextAttacks(),
      pack.contextWeightAdjustments,
    );
    const attacked = applyAttacks(fixtureContextGraph(), reweighted);
    expect(integrity(attacked)).toBeLessThan(10);
    const failures = detectFailures(attacked);
    expect(failures.has("T")).toBe(true);
    expect(failures.has("c_exec")).toBe(true);
    expect(failures.has("c_reliab")).toBe(true);
    expect(failures.has("k_credible")).toBe(true);
    expect(failures.has("c_roi")).toBe(false);
  });

  // The outcome must actually MOVE between the two paths — this is the demo.
  it("context strictly lowers integrity and uniquely fails the keystone", () => {
    const raw = applyAttacks(fixtureContextGraph(), fixtureContextAttacks());
    const pack = fixtureDecisionContextPack();
    const reweighted = applyAttacks(
      fixtureContextGraph(),
      reweightAttacksByContext(fixtureContextAttacks(), pack.contextWeightAdjustments),
    );
    expect(integrity(reweighted)).toBeLessThan(integrity(raw));
    // The keystone survives the raw assault but fails once grounded in context.
    expect(detectFailures(raw).has("k_credible")).toBe(false);
    expect(detectFailures(reweighted).has("k_credible")).toBe(true);
  });
});
