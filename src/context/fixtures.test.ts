import { describe, it, expect } from "vitest";
import {
  applyAttacks,
  detectFailures,
  integrity,
  keystone,
  rankLoadBearing,
} from "@/engine";
import { GraphSchema, AttacksSchema } from "@/llm/schemas";
import {
  CompanyContextSchema,
  DecisionContextPackSchema,
} from "./schemas";
import {
  fixtureCompanyContext,
  fixtureContextAttacks,
  fixtureContextGraph,
  fixtureDecisionContextPack,
} from "./fixtures";

describe("context fixtures — schema validity", () => {
  it("company context validates", () => {
    expect(() => CompanyContextSchema.parse(fixtureCompanyContext())).not.toThrow();
  });
  it("decision context pack validates", () => {
    expect(() => DecisionContextPackSchema.parse(fixtureDecisionContextPack())).not.toThrow();
  });
  it("context graph validates and has 9 nodes", () => {
    expect(() => GraphSchema.parse(fixtureContextGraph())).not.toThrow();
    expect(fixtureContextGraph().nodes.length).toBe(9);
  });
  it("context attacks validate and target existing ids", () => {
    expect(() => AttacksSchema.parse({ attacks: fixtureContextAttacks() })).not.toThrow();
    const ids = new Set(fixtureContextGraph().nodes.map((n) => n.id));
    for (const a of fixtureContextAttacks()) expect(ids.has(a.targetId)).toBe(true);
  });
});

describe("decision context pack — content", () => {
  const pack = fixtureDecisionContextPack();
  it("includes temporal facts about the meeting", () => {
    expect(pack.relevantTemporalFacts.join(" ").toLowerCase()).toContain("meeting");
  });
  it("increases weight on execution, reliability, auditability, and timeline", () => {
    const inc = new Set(
      pack.contextWeightAdjustments
        .filter((w) => w.direction === "increase")
        .map((w) => w.targetCategory),
    );
    for (const c of ["execution", "reliability", "auditability", "timeline"] as const) {
      expect(inc.has(c)).toBe(true);
    }
  });
  it("flags missing information (SLA / incident rate)", () => {
    expect(pack.missingInformation.join(" ").toLowerCase()).toMatch(/sla|incident/);
  });
  it("passes a custom decision through", () => {
    expect(fixtureDecisionContextPack("Do X?").decision).toBe("Do X?");
  });
});

describe("context hero graph — pinned engine behaviour (product-AND)", () => {
  it("baseline integrity ~= 61.97", () => {
    expect(integrity(fixtureContextGraph())).toBeCloseTo(61.97, 1);
  });

  it("keystone is k_credible and strictly dominant (>= 5x next assumption)", () => {
    const g = fixtureContextGraph();
    expect(keystone(g)?.id).toBe("k_credible");
    const ranked = rankLoadBearing(g);
    expect(ranked[0].id).toBe("k_credible");
    expect(ranked[0].impact).toBeGreaterThanOrEqual(5 * ranked[1].impact);
  });

  it("post-load integrity craters below 10", () => {
    const attacked = applyAttacks(fixtureContextGraph(), fixtureContextAttacks());
    expect(integrity(attacked)).toBeLessThan(10);
  });

  it("partial collapse: T/c_exec/c_reliab/k_credible fail, c_roi holds", () => {
    const attacked = applyAttacks(fixtureContextGraph(), fixtureContextAttacks());
    const failures = detectFailures(attacked);
    for (const id of ["T", "c_exec", "c_reliab", "k_credible"]) {
      expect(failures.has(id)).toBe(true);
    }
    expect(failures.has("c_roi")).toBe(false);
  });
});
