import { describe, it, expect } from "vitest";
import {
  CompanyContextSchema,
  DecisionContextPackSchema,
  ContextCompileSchema,
  postClamp,
  type ContextCompileOutput,
} from "./schemas";
import type { ContextCompileResult } from "./types";
import {
  fixtureCompanyContext,
  fixtureDecisionContextPack,
} from "./fixtures";

describe("context schemas", () => {
  it("validate the fixtures", () => {
    expect(() => CompanyContextSchema.parse(fixtureCompanyContext())).not.toThrow();
    expect(() => DecisionContextPackSchema.parse(fixtureDecisionContextPack())).not.toThrow();
    expect(() =>
      ContextCompileSchema.parse({
        companyContext: fixtureCompanyContext(),
        decisionContextPack: fixtureDecisionContextPack(),
      }),
    ).not.toThrow();
  });

  it("rejects a malformed enum", () => {
    const bad = fixtureCompanyContext();
    // @ts-expect-error deliberately invalid constraint type
    bad.constraints[0].type = "bogus";
    expect(() => CompanyContextSchema.parse(bad)).toThrow();
  });

  it("rejects a missing required array", () => {
    const bad = fixtureCompanyContext() as unknown as Record<string, unknown>;
    delete (bad.business as Record<string, unknown>).customers;
    expect(() => CompanyContextSchema.parse(bad)).toThrow();
  });

  it("rejects a wrong field type (severity as a string)", () => {
    const bad = fixtureCompanyContext();
    // @ts-expect-error deliberately wrong type
    bad.constraints[0].severity = "oops";
    expect(() => CompanyContextSchema.parse(bad)).toThrow();
  });

  it("postClamp normalises NaN -> 0 and Infinity -> 1", () => {
    const cc = fixtureCompanyContext();
    cc.temporal.urgencyLevel = Number.NaN;
    cc.constraints[0].severity = Number.POSITIVE_INFINITY;
    const out = postClamp({ companyContext: cc, decisionContextPack: fixtureDecisionContextPack() });
    expect(out.companyContext.temporal.urgencyLevel).toBe(0);
    expect(out.companyContext.constraints[0].severity).toBe(1);
  });

  it("postClamp clamps out-of-range scores and normalises teamSize", () => {
    const cc = fixtureCompanyContext();
    cc.temporal.urgencyLevel = 5;
    cc.temporal.upcomingEvents[0].importance = -2;
    cc.constraints[0].severity = 9;
    cc.technical.teamSize = 4.7;
    const dp = fixtureDecisionContextPack();
    dp.contextWeightAdjustments[0].magnitude = 3;
    const out = postClamp({ companyContext: cc, decisionContextPack: dp });
    expect(out.companyContext.temporal.urgencyLevel).toBe(1);
    expect(out.companyContext.temporal.upcomingEvents[0].importance).toBe(0);
    expect(out.companyContext.constraints[0].severity).toBe(1);
    expect(out.companyContext.technical.teamSize).toBe(5);
    expect(out.decisionContextPack.contextWeightAdjustments[0].magnitude).toBe(1);
  });
});

describe("ContextCompileResult <-> ContextCompileOutput assignability", () => {
  it("is assignable both ways (compile-time)", () => {
    const result: ContextCompileResult = {
      companyContext: fixtureCompanyContext(),
      decisionContextPack: fixtureDecisionContextPack(),
    };
    // Result -> Output
    const asOutput: ContextCompileOutput = result;
    // Output -> Result
    const asResult: ContextCompileResult = asOutput;
    expect(asResult.decisionContextPack.decision).toBe(result.decisionContextPack.decision);
  });
});
