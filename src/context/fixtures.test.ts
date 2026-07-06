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
  fixtureContextGraphR,
  fixtureContextAttacksR,
  fixtureDecisionContextPackR,
  SCENARIOS,
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
    expect(rawIntegrity).toBeCloseTo(18.04, 0);
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

  it("is a 9-node structure in the layered-2-5d band (V7-1 deepened)", () => {
    const g = fixtureContextGraphB();
    expect(g.nodes.length).toBe(9);
    expect(pickLayoutMode(g.nodes.length)).toBe("layered-2-5d");
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

// ── Scenario R — a REAL project (Excalidraw), generated live + pinned ──────────
// STRUCTURE + EVIDENCE captured verbatim from a live pipeline run (see
// scripts/generate-scenario-r.mjs / scenario-r.artifacts.json). The beat is a grounded
// collapse with a partial hold: the "6-person team has spare capacity" keystone HOLDS a
// raw assault but CRACKS once the pack's ▲execution weight grounds the same attack; the
// differentiation claim holds throughout. Numbers worked against the real engine.
describe("scenario R (Excalidraw · real) fixture — grounded collapse, partial hold", () => {
  it("produces a graph that validates against GraphSchema", () => {
    expect(() => GraphSchema.parse(fixtureContextGraphR())).not.toThrow();
  });

  it("is a 13-node structure in the layered-2-5d band (Band 2)", () => {
    const g = fixtureContextGraphR();
    expect(g.nodes.length).toBe(13);
    expect(pickLayoutMode(g.nodes.length)).toBe("layered-2-5d");
  });

  it("has a standing baseline integrity (~55.4%)", () => {
    expect(integrity(fixtureContextGraphR())).toBeCloseTo(55.40, 1);
  });

  it("has team_has_backend_capacity as the keystone (AND-path tie broken by node order)", () => {
    const g = fixtureContextGraphR();
    expect(keystone(g)?.id).toBe("team_has_backend_capacity");
    const ranked = rankLoadBearing(g);
    // Every AND-path assumption is individually fatal, so five tie on impact; the OR-only
    // leg competitive_urgency_real is the sole low-impact assumption (~0).
    const comp = ranked.find((r) => r.id === "competitive_urgency_real")!;
    expect(comp.impact).toBeCloseTo(0, 5);
    // The keystone's impact is the (tied) maximum — strictly greater than the OR-only leg.
    expect(ranked[0].impact).toBeGreaterThan(comp.impact + 1);
  });

  it("grounds ≥60% of assumptions in real evidence (here 8/9, real paths + urls)", () => {
    const assumptions = fixtureContextGraphR().nodes.filter((n) => n.type === "assumption");
    // V7-4 · evidence is a multi-citation array; grounded = at least one citation with a source.
    const grounded = assumptions.filter((n) => n.evidence && n.evidence.length > 0 && n.evidence[0].source);
    expect(grounded.length / assumptions.length).toBeGreaterThanOrEqual(0.6);
    expect(grounded.length).toBe(8);
    // Provenance is real repo file paths + real urls (V4-3: judge-clickable).
    const sources = grounded.flatMap((n) => n.evidence!.map((e) => e.source));
    expect(sources).toContain("excalidraw-app/package.json");
    expect(sources.some((s) => s.startsWith("https://"))).toBe(true);
  });

  it("carries ≥2 constraint-shaped entries in the pack (V4-2 boundary planes)", () => {
    expect(fixtureDecisionContextPackR().relevantConstraints.length).toBeGreaterThanOrEqual(2);
  });

  it("RAW attacks (context ignored): keystone HOLDS, differentiation HOLDS, structure stressed", () => {
    const raw = applyAttacks(fixtureContextGraphR(), fixtureContextAttacksR());
    const failures = detectFailures(raw);
    expect(failures.has("team_has_backend_capacity")).toBe(false); // keystone holds raw
    expect(failures.has("differentiates_vs_competitors")).toBe(false); // partial hold, both ways
    expect(integrity(raw)).toBeCloseTo(18.56, 1);
  });

  it("REWEIGHTED attacks (grounded in context): keystone CRACKS, thesis craters, differentiation holds", () => {
    const pack = fixtureDecisionContextPackR();
    const reweighted = applyAttacks(
      fixtureContextGraphR(),
      reweightAttacksByContext(fixtureContextAttacksR(), pack.contextWeightAdjustments),
    );
    expect(integrity(reweighted)).toBeLessThan(10);
    expect(integrity(reweighted)).toBeCloseTo(9.69, 1);
    const failures = detectFailures(reweighted);
    expect(failures.has("team_has_backend_capacity")).toBe(true); // keystone fails once grounded
    expect(failures.has("team_can_build_operate_infra")).toBe(true); // its claim cascades
    expect(failures.has("build_own_realtime_backend_now")).toBe(true); // thesis craters
    expect(failures.has("differentiates_vs_competitors")).toBe(false); // partial hold
  });

  it("context strictly lowers integrity and uniquely fails the keystone (the beat)", () => {
    const raw = applyAttacks(fixtureContextGraphR(), fixtureContextAttacksR());
    const pack = fixtureDecisionContextPackR();
    const reweighted = applyAttacks(
      fixtureContextGraphR(),
      reweightAttacksByContext(fixtureContextAttacksR(), pack.contextWeightAdjustments),
    );
    expect(integrity(reweighted)).toBeLessThan(integrity(raw));
    expect(detectFailures(raw).has("team_has_backend_capacity")).toBe(false);
    expect(detectFailures(reweighted).has("team_has_backend_capacity")).toBe(true);
  });
});

describe("scenario source seeds (real agent-input prefill)", () => {
  it("carries the REAL Excalidraw source values on scenario R", () => {
    const s = SCENARIOS.R.sources;
    expect(s?.technical?.repoUrl).toBe("https://github.com/excalidraw/excalidraw");
    expect(s?.technical?.branch).toBe("master");
    expect(s?.business?.website).toBe("https://excalidraw.com");
    expect(s?.business?.competitors).toEqual(["tldraw", "Figma FigJam", "Miro"]);
    // Real temporal notes mention the 2-day roadmap meeting and tldraw's raise.
    expect(s?.temporal?.notes).toMatch(/roadmap/i);
    expect(s?.temporal?.notes).toMatch(/tldraw/i);
    expect(s?.temporal?.notes).toMatch(/2 days/i);
  });

  it("seeds only the temporal notes for the illustrative A / B scenarios", () => {
    for (const id of ["A", "B"] as const) {
      const s = SCENARIOS[id].sources;
      expect(s?.temporal?.notes).toBe(SCENARIOS[id].input.temporalContextText);
      // No fabricated repo/website for a hypothetical company.
      expect(s?.technical).toBeUndefined();
      expect(s?.business).toBeUndefined();
    }
  });
});
