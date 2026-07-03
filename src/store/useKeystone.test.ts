import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectIntegrity, selectKeystoneId, selectFailures } from "./useKeystone";
import { fixtureContextGraph, fixtureContextAttacks } from "@/context";

describe("keystone store (context fixtures)", () => {
  it("computes integrity from the working graph", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    expect(selectIntegrity(store.getState())).toBeGreaterThan(55);
  });

  it("setConfidence changes integrity", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    const before = selectIntegrity(store.getState());
    store.getState().setConfidence("k_credible", 0.05);
    expect(selectIntegrity(store.getState())).toBeLessThan(before);
  });

  it("applyLoad drops integrity and marks failures", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());
    expect(store.getState().loadApplied).toBe(true);
    expect(selectIntegrity(store.getState())).toBeLessThan(10);
    expect(selectFailures(store.getState()).has("k_credible")).toBe(true);
    expect(selectKeystoneId(store.getState())).toBe("k_credible");
  });

  it("reset returns the working graph to the base graph", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());
    store.getState().reset();
    expect(store.getState().loadApplied).toBe(false);
    expect(selectIntegrity(store.getState())).toBeGreaterThan(55);
  });
});
