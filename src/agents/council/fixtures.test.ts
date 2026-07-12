import { describe, expect, it } from "vitest";
import {
  fixtureContextGraph,
  fixtureContextGraphB,
  fixtureContextGraphR,
} from "@/context/fixtures";
import { fixtureCouncil, fixtureRemediations } from "./fixtures";

const GRAPHS = {
  A: fixtureContextGraph,
  B: fixtureContextGraphB,
  R: fixtureContextGraphR,
} as const;

describe("fixtureCouncil", () => {
  (["A", "B", "R"] as const).forEach((scenario) => {
    it(`returns a grounded CouncilResult for scenario ${scenario}`, () => {
      const graph = GRAPHS[scenario]();
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      const result = fixtureCouncil(scenario);

      expect(result.grounded).toBe(true);
      expect(result.source).toBe("fixture");

      expect(result.contextualAttacks.length).toBeGreaterThanOrEqual(2);
      expect(result.contextualAttacks.length).toBeLessThanOrEqual(4);
      for (const attack of result.contextualAttacks) {
        expect(nodeIds.has(attack.targetId)).toBe(true);
        expect(attack.severity).toBeGreaterThanOrEqual(0.15);
        expect(attack.severity).toBeLessThanOrEqual(0.55);
        expect(attack.rationale.length).toBeGreaterThan(0);
      }

      expect(result.nodeWeights.length).toBeGreaterThan(0);
      for (const weighting of result.nodeWeights) {
        expect(nodeIds.has(weighting.nodeId)).toBe(true);
        expect(weighting.contextWeight).toBeGreaterThanOrEqual(0);
        expect(weighting.contextWeight).toBeLessThanOrEqual(1);
        expect(weighting.evidenceRefs.length).toBeGreaterThan(0);
        expect(weighting.rationale.length).toBeGreaterThan(0);
      }

      for (const assumption of result.hiddenAssumptions) {
        expect(assumption.evidenceRefs.length).toBeGreaterThan(0);
        expect(assumption.label.length).toBeGreaterThan(0);
        expect(assumption.why.length).toBeGreaterThan(0);
      }

      expect(result.fractureNarrative.length).toBeGreaterThan(0);

      if (result.contextKeystoneId !== null) {
        expect(nodeIds.has(result.contextKeystoneId)).toBe(true);
      }
    });
  });

  it("scenario A's contextKeystoneId is non-null and differs from the topological keystone k_credible", () => {
    const result = fixtureCouncil("A");
    expect(result.contextKeystoneId).not.toBeNull();
    expect(result.contextKeystoneId).not.toBe("k_credible");
  });
});

describe("fixtureRemediations (offline, grounded)", () => {
  for (const scenario of ["A", "B", "R"] as const) {
    it(`scenario ${scenario}: remediations are grounded and well-formed`, () => {
      const council = fixtureCouncil(scenario);
      expect(council.remediationSource).toBe("fixture");
      expect(council.remediations.length).toBeGreaterThan(0);

      // Every remediation is grounded (>=1 evidenceRef) and its findingId resolves to a
      // surviving finding: a "spine" -> the contextKeystoneId; a "hidden" -> a hidden label.
      const hiddenLabels = new Set(council.hiddenAssumptions.map((h) => h.label));
      for (const r of council.remediations) {
        expect(["spine", "hidden"]).toContain(r.kind);
        expect(r.action.length).toBeGreaterThan(0);
        expect(r.evidenceRefs.length).toBeGreaterThan(0);
        if (r.kind === "spine") expect(r.findingId).toBe(council.contextKeystoneId);
        else expect(hiddenLabels.has(r.findingId)).toBe(true);
      }
      // Exactly one spine remediation, targeting the context-keystone.
      expect(council.remediations.filter((r) => r.kind === "spine")).toHaveLength(1);
    });
  }

  it("scenario A's spine remediation targets the shifted spine a_audit", () => {
    const council = fixtureCouncil("A");
    const spine = council.remediations.find((r) => r.kind === "spine");
    expect(spine?.findingId).toBe("a_audit");
  });

  it("fixtureRemediations returns the same array fixtureCouncil embeds", () => {
    expect(fixtureRemediations("B")).toEqual(fixtureCouncil("B").remediations);
  });
});
