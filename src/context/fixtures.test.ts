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
  fixtureContextGraphB,
  fixtureContextAttacksB,
  fixtureDecisionContextPackB,
} from "./fixtures";
import { reweightAttacksByContext } from "./weights";
import { pickLayoutMode } from "@/canvas/layout";

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

// ── Scenario B — the contrasting decision that HOLDS ──────────────────────
// Same company + same "meeting tomorrow" context SHAPE, but the conservative
// "reinforce first" decision survives the reweighted assault. This proves the
// tool DISCRIMINATES — it doesn't just collapse whatever graph it's handed.
describe("scenario B (reinforce) fixture — holds under load", () => {
  it("produces a graph that validates against GraphSchema", () => {
    expect(() => GraphSchema.parse(fixtureContextGraphB())).not.toThrow();
  });

  it("is a 7-node structure in the simple-2d band (contrast with the 9-node hero)", () => {
    const g = fixtureContextGraphB();
    expect(g.nodes.length).toBe(7);
    expect(pickLayoutMode(g.nodes.length)).toBe("simple-2d");
  });

  it("has a healthy baseline integrity (~69%) with k_sre as a dominant keystone", () => {
    const g = fixtureContextGraphB();
    expect(integrity(g)).toBeCloseTo(69.04, 1);
    expect(keystone(g)?.id).toBe("k_sre");
    const ranked = rankLoadBearing(g);
    // Keystone feeds both claims → strictly dominant over the next assumption.
    expect(ranked[0].id).toBe("k_sre");
    expect(ranked[0].impact).toBeGreaterThanOrEqual(5 * ranked[1].impact);
  });

  it("RAW attacks (context ignored): survives with zero failures", () => {
    const raw = applyAttacks(fixtureContextGraphB(), fixtureContextAttacksB());
    expect(detectFailures(raw).size).toBe(0);
    expect(integrity(raw)).toBeCloseTo(49.21, 1);
  });

  // The differentiator, inverted: the SAME hero-shaped reweight (▲ execution/
  // reliability) only mildly stresses this plan — integrity stays in the 45–60%
  // band, no node fails, and the keystone holds. Discrimination, not collapse.
  it("REWEIGHTED attacks (grounded in context): STILL holds, integrity 45–60%, keystone survives", () => {
    const pack = fixtureDecisionContextPackB();
    const reweighted = reweightAttacksByContext(
      fixtureContextAttacksB(),
      pack.contextWeightAdjustments,
    );
    const attacked = applyAttacks(fixtureContextGraphB(), reweighted);
    const value = integrity(attacked);
    expect(value).toBeGreaterThan(45);
    expect(value).toBeLessThan(60);
    expect(value).toBeCloseTo(47.59, 1);
    const failures = detectFailures(attacked);
    expect(failures.size).toBe(0);
    expect(failures.has("k_sre")).toBe(false);
    expect(failures.has("T")).toBe(false);
    // The keystone remains identifiable (still the top load-bearing node) but intact.
    expect(keystone(attacked)?.id).toBe("k_sre");
  });

  it("context stays comfortably above the 0.35 failure threshold either way", () => {
    const raw = applyAttacks(fixtureContextGraphB(), fixtureContextAttacksB());
    const pack = fixtureDecisionContextPackB();
    const reweighted = applyAttacks(
      fixtureContextGraphB(),
      reweightAttacksByContext(fixtureContextAttacksB(), pack.contextWeightAdjustments),
    );
    // Reweighting lowers integrity (context makes it harder) but never breaks it.
    expect(integrity(reweighted)).toBeLessThan(integrity(raw));
    expect(detectFailures(reweighted).size).toBe(0);
  });
});
