import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectProbabilistic } from "./useKeystone";
import { fixtureContextGraph, fixtureContextAttacks } from "@/context/fixtures";

describe("store exposes probabilistic result after a solve", () => {
  it("is null before load and populated after", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    expect(selectProbabilistic(store.getState())).toBeNull();

    store.getState().applyLoad(fixtureContextAttacks());
    const p = selectProbabilistic(store.getState());
    expect(p).not.toBeNull();
    expect(p!.pHold).toBeGreaterThanOrEqual(0);
    expect(p!.pHold).toBeLessThanOrEqual(1);
  });

  it("resets to null on reset()", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());
    expect(selectProbabilistic(store.getState())).not.toBeNull();

    store.getState().reset();
    expect(selectProbabilistic(store.getState())).toBeNull();
  });
});
