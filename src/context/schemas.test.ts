import { describe, it, expect } from "vitest";
import { postClamp, ContextCompileSchema } from "./schemas";
import type { ContextCompileOutput } from "./schemas";
import { fixtureCompanyContext, fixtureDecisionContextPack } from "./fixtures";

// A schema-valid baseline we can perturb per-test.
function base(): ContextCompileOutput {
  return {
    companyContext: fixtureCompanyContext(),
    decisionContextPack: fixtureDecisionContextPack(),
  };
}

describe("postClamp", () => {
  it("clamps every out-of-range 0..1 score to [0,1] across companyContext", () => {
    const input = base();
    input.companyContext.temporal.urgencyLevel = 1.5;
    input.companyContext.temporal.upcomingEvents[0].importance = 2;
    input.companyContext.temporal.deadlines[0].severity = -0.4;
    input.companyContext.constraints[0].severity = 9;
    input.companyContext.objectives[0].priority = -1;
    input.companyContext.knownRisks[0].likelihood = 1.2;
    input.companyContext.knownRisks[0].severity = -3;

    const out = postClamp(input);
    const t = out.companyContext.temporal;
    expect(t.urgencyLevel).toBe(1);
    expect(t.upcomingEvents[0].importance).toBe(1);
    expect(t.deadlines[0].severity).toBe(0);
    expect(out.companyContext.constraints[0].severity).toBe(1);
    expect(out.companyContext.objectives[0].priority).toBe(0);
    expect(out.companyContext.knownRisks[0].likelihood).toBe(1);
    expect(out.companyContext.knownRisks[0].severity).toBe(0);
  });

  it("clamps every out-of-range 0..1 score across the decisionContextPack", () => {
    const input = base();
    input.decisionContextPack.relevantConstraints[0].severity = 5;
    input.decisionContextPack.relevantObjectives[0].priority = -2;
    input.decisionContextPack.relevantKnownRisks[0].likelihood = 1.9;
    input.decisionContextPack.relevantKnownRisks[0].severity = -0.1;
    input.decisionContextPack.contextWeightAdjustments[0].magnitude = 3;

    const out = postClamp(input);
    const p = out.decisionContextPack;
    expect(p.relevantConstraints[0].severity).toBe(1);
    expect(p.relevantObjectives[0].priority).toBe(0);
    expect(p.relevantKnownRisks[0].likelihood).toBe(1);
    expect(p.relevantKnownRisks[0].severity).toBe(0);
    expect(p.contextWeightAdjustments[0].magnitude).toBe(1);
  });

  it("forces teamSize to a non-negative integer", () => {
    const neg = base();
    neg.companyContext.technical.teamSize = -4;
    expect(postClamp(neg).companyContext.technical.teamSize).toBe(0);

    const frac = base();
    frac.companyContext.technical.teamSize = 6.7;
    expect(postClamp(frac).companyContext.technical.teamSize).toBe(7);

    const missing = base();
    missing.companyContext.technical.teamSize = undefined;
    expect(postClamp(missing).companyContext.technical.teamSize).toBeUndefined();
  });

  it("leaves in-range values untouched and returns a schema-valid, structurally-equal result", () => {
    const input = base();
    const out = postClamp(input);
    // Fixtures are already in range → clamping is a no-op on values.
    expect(out).toEqual(input);
    // Still schema-valid.
    expect(() => ContextCompileSchema.parse(out)).not.toThrow();
  });

  it("does not mutate the input object", () => {
    const input = base();
    input.companyContext.temporal.urgencyLevel = 2;
    postClamp(input);
    expect(input.companyContext.temporal.urgencyLevel).toBe(2); // original untouched
  });
});
