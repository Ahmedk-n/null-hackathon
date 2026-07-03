import { describe, it, expect, beforeEach } from "vitest";
import { extractStructure, generateAttacks } from "./client";
import { fixtureGraph } from "./fixture";
import { GraphSchema, AttacksSchema } from "./schemas";
import { fixtureContextGraph, fixtureDecisionContextPack } from "@/context/fixtures";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("extractStructure (no key -> fixture fallback)", () => {
  it("returns a schema-valid base graph without throwing", async () => {
    const graph = await extractStructure("anything");
    expect(() => GraphSchema.parse(graph)).not.toThrow();
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.some((n) => n.id === "a_arch")).toBe(true);
  });

  it("returns the context hero graph when a pack is supplied", async () => {
    const graph = await extractStructure("Should we migrate?", fixtureDecisionContextPack());
    expect(() => GraphSchema.parse(graph)).not.toThrow();
    expect(graph.nodes.some((n) => n.id === "k_credible")).toBe(true);
  });
});

describe("generateAttacks (no key -> fixture fallback)", () => {
  it("returns schema-valid base attacks without throwing", async () => {
    const attacks = await generateAttacks(fixtureGraph());
    expect(() => AttacksSchema.parse({ attacks })).not.toThrow();
    expect(attacks.length).toBeGreaterThan(0);
  });

  it("returns context attacks when a pack is supplied", async () => {
    const attacks = await generateAttacks(fixtureContextGraph(), fixtureDecisionContextPack());
    expect(() => AttacksSchema.parse({ attacks })).not.toThrow();
    expect(attacks.some((a) => a.targetId === "k_credible")).toBe(true);
  });
});
