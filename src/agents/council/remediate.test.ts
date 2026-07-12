import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureCompanyContext, fixtureDecisionContextPack } from "@/context";
import { fixtureCouncil } from "./fixtures";
import { remediateFindings } from "./remediate";

describe("remediateFindings (no API key)", () => {
  it("returns grounded fixture remediations without throwing or calling the network", async () => {
    const graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();
    const company = fixtureCompanyContext();
    const council = fixtureCouncil("A");

    const result = await remediateFindings(
      graph,
      pack,
      company,
      council.contextKeystoneId,
      council.hiddenAssumptions,
      [],
    );

    expect(result.source).toBe("fixture");
    expect(result.remediations.length).toBeGreaterThan(0);
    for (const r of result.remediations) {
      expect(["spine", "hidden"]).toContain(r.kind);
      expect(typeof r.action).toBe("string");
      expect(r.action.length).toBeGreaterThan(0);
      expect(Array.isArray(r.evidenceRefs)).toBe(true);
    }
  });

  it("caps remediations and always resolves (fixture) for scenario B + R too", async () => {
    for (const scenario of ["B", "R"] as const) {
      const council = fixtureCouncil(scenario);
      const result = await remediateFindings(
        fixtureContextGraph(),
        fixtureDecisionContextPack(),
        fixtureCompanyContext(),
        council.contextKeystoneId,
        council.hiddenAssumptions,
        [],
      );
      expect(result.remediations.length).toBeGreaterThan(0);
      expect(result.remediations.length).toBeLessThanOrEqual(4);
    }
  });
});
