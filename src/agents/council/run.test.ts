import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureCompanyContext, fixtureDecisionContextPack } from "@/context";
import type { CompanyContext, DecisionContextPack } from "@/context";
import { runCouncil } from "./index";

describe("runCouncil (no API key)", () => {
  it("returns a grounded fixture CouncilResult with real targetIds, non-throwing", async () => {
    const graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();
    const company = fixtureCompanyContext();

    const result = await runCouncil({ graph, pack, company, findings: [] });

    expect(result.source).toBe("fixture");
    expect(typeof result.grounded).toBe("boolean");

    // Pack/company constraint/objective/knownRisk ids are threaded into findingKeys
    // regardless of the (empty) findings array, so the hand-authored fixtureCouncil claims
    // (which cite those pack/company ids) survive the critic on the offline path.
    expect(result.grounded).toBe(true);
    expect(result.nodeWeights.length).toBeGreaterThan(0);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    expect(result.contextualAttacks.length).toBeGreaterThan(0);
    for (const attack of result.contextualAttacks) {
      expect(nodeIds.has(attack.targetId)).toBe(true);
    }
    if (result.contextKeystoneId !== null) {
      expect(nodeIds.has(result.contextKeystoneId)).toBe(true);
    }
  });

  it("never throws even when company/pack are malformed (whole-runner catch)", async () => {
    const graph = fixtureContextGraph();
    const badCompany = {} as unknown as CompanyContext;
    const badPack = {} as unknown as DecisionContextPack;

    const result = await runCouncil({ graph, pack: badPack, company: badCompany, findings: [] });

    expect(result.source).toBe("fixture");
    expect(typeof result.grounded).toBe("boolean");
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const attack of result.contextualAttacks) {
      expect(nodeIds.has(attack.targetId)).toBe(true);
    }
  });
});
