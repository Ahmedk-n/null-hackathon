import { describe, it, expect } from "vitest";
import { GraphSchema, AttacksSchema } from "./schemas";
import { fixtureGraph, fixtureAttacks } from "./fixture";
import { keystone, applyAttacks, integrity } from "@/engine";

describe("base fixture", () => {
  it("produces a graph that validates against GraphSchema", () => {
    expect(() => GraphSchema.parse(fixtureGraph())).not.toThrow();
  });

  it("produces attacks that validate against AttacksSchema", () => {
    expect(() => AttacksSchema.parse({ attacks: fixtureAttacks() })).not.toThrow();
  });

  it("has a_arch as its keystone", () => {
    expect(keystone(fixtureGraph())?.id).toBe("a_arch");
  });

  it("craters once its attacks are applied", () => {
    const base = integrity(fixtureGraph());
    const attacked = integrity(applyAttacks(fixtureGraph(), fixtureAttacks()));
    // product-AND baseline is moderate (~13.7%); attacks drive it toward zero.
    expect(base).toBeCloseTo(13.74, 1);
    expect(attacked).toBeLessThan(base);
    expect(attacked).toBeLessThan(1);
  });

  it("every attack targets an existing assumption id", () => {
    const ids = new Set(fixtureGraph().nodes.map((n) => n.id));
    for (const a of fixtureAttacks()) expect(ids.has(a.targetId)).toBe(true);
  });
});
