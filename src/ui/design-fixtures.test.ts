// V6-1 · pinned DESIGN candidates — verdicts computed by the PURE engine (raw + grounded).
// Asserts the tournament beat holds: exactly ONE survivor (✓ STANDS ≥35), one ⚠ STRESSED
// (10–35), one ✗ COLLAPSED (<10). The LLM never ranks — these numbers are the solver's.
import { describe, it, expect } from "vitest";
import { applyAttacks, detectFailures, integrity, keystone } from "@/engine";
import { fixtureDesignCandidatesR, fixtureDecisionContextPackR } from "@/context/fixtures";
import { reweightAttacksByContext } from "@/context/weights";

const band = (i: number) => (i >= 35 ? "STANDS" : i >= 10 ? "STRESSED" : "COLLAPSED");

describe("fixtureDesignCandidatesR — pinned tournament verdicts", () => {
  const candidates = fixtureDesignCandidatesR();
  const pack = fixtureDecisionContextPackR();

  it("returns exactly 3 candidates, one per lens", () => {
    expect(candidates.length).toBe(3);
    expect(candidates.map((c) => c.lens).sort()).toEqual(["aggressive", "conservative", "hybrid"]);
  });

  const verdicts = candidates.map((c) => {
    const grounded = reweightAttacksByContext(c.attacks, pack.contextWeightAdjustments);
    const raw = integrity(c.graph);
    const groundedInt = integrity(applyAttacks(c.graph, grounded));
    return { lens: c.lens, label: c.label, raw, groundedInt, band: band(groundedInt) };
  });

  it("prints the pinned verdict table (provenance)", () => {
    for (const v of verdicts) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${v.lens.padEnd(12)} "${v.label}" raw=${v.raw.toFixed(1)}% grounded=${v.groundedInt.toFixed(1)}% → ${v.band}`,
      );
    }
    expect(verdicts.length).toBe(3);
  });

  it("each candidate graph is well-formed (5–12 nodes, single thesis, valid keystone)", () => {
    for (const c of candidates) {
      expect(c.graph.nodes.length).toBeGreaterThanOrEqual(5);
      expect(c.graph.nodes.length).toBeLessThanOrEqual(12);
      expect(c.graph.nodes.filter((n) => n.type === "thesis").length).toBe(1);
      expect(keystone(c.graph)).not.toBeNull();
      // attacks target only assumptions
      const assumptionIds = new Set(c.graph.nodes.filter((n) => n.type === "assumption").map((n) => n.id));
      for (const a of c.attacks) expect(assumptionIds.has(a.targetId)).toBe(true);
      // raw severities within the live wall band [0.1, 0.55]
      for (const a of c.attacks) expect(a.severity).toBeLessThanOrEqual(0.55);
    }
  });

  it("exactly ONE survivor (STANDS), one STRESSED, one COLLAPSED — a clean beat", () => {
    const bands = verdicts.map((v) => v.band).sort();
    expect(bands).toEqual(["COLLAPSED", "STANDS", "STRESSED"]);
  });

  it("the survivor is the CONSERVATIVE lens", () => {
    const survivor = verdicts.find((v) => v.band === "STANDS");
    expect(survivor?.lens).toBe("conservative");
  });

  it("the AGGRESSIVE lens collapses (build-your-own-backend reproduces scenario R)", () => {
    const aggressive = verdicts.find((v) => v.lens === "aggressive")!;
    expect(aggressive.band).toBe("COLLAPSED");
    // its keystone is the team-capacity assumption, and it fails under grounded load
    const c = candidates.find((x) => x.lens === "aggressive")!;
    const grounded = reweightAttacksByContext(c.attacks, pack.contextWeightAdjustments);
    const failed = detectFailures(applyAttacks(c.graph, grounded));
    expect(failed.has(keystone(c.graph)!.id)).toBe(true);
  });
});
