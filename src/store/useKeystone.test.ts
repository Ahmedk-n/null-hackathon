import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectIntegrity, selectKeystoneId, selectFailures } from "./useKeystone";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureCompanyContext,
  fixtureDecisionContextPack,
} from "@/context";

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

  // Regression: selectFailures MUST return a referentially stable snapshot across repeated calls
  // on unchanged state. Returning a fresh Set each call breaks React 19's useSyncExternalStore
  // (infinite re-render / "Maximum update depth exceeded" + hydration mismatch).
  it("selectFailures is referentially stable across renders", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    // Pre-load: stable empty reference reused every call.
    expect(selectFailures(store.getState())).toBe(selectFailures(store.getState()));
    store.getState().applyLoad(fixtureContextAttacks());
    // Post-load: same populated reference on repeated selects (no per-call allocation).
    const a = selectFailures(store.getState());
    const b = selectFailures(store.getState());
    expect(a).toBe(b);
    expect(a.has("k_credible")).toBe(true);
  });
});

describe("keystone store (context integration)", () => {
  it("setContext stores companyContext, pack, and source", () => {
    const store = createKeystoneStore();
    const pack = fixtureDecisionContextPack();
    store.getState().setContext(fixtureCompanyContext(), pack, "fixture");
    expect(store.getState().companyContext).not.toBeNull();
    expect(store.getState().decisionContextPack).toBe(pack);
    expect(store.getState().contextSource).toBe("fixture");
  });

  it("applyLoad reweights severities via context but the engine still picks k_credible", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");

    store.getState().applyLoad(fixtureContextAttacks());

    // Reweight is applied: the execution-increase (magnitude 0.8) pushes atk_k above its raw 0.8.
    const stored = store.getState().attacks.find((a) => a.id === "atk_k");
    const raw = fixtureContextAttacks().find((a) => a.id === "atk_k");
    expect(stored?.severity).toBeGreaterThan(raw?.severity ?? 0);

    // The engine — not the LLM/context — still decides the keystone and the failures.
    expect(selectKeystoneId(store.getState())).toBe("k_credible");
    expect(selectFailures(store.getState()).has("k_credible")).toBe(true);
    expect(selectIntegrity(store.getState())).toBeLessThan(10);
  });

  it("applyContextWeights=false leaves severities untouched", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.setState({ applyContextWeights: false });

    store.getState().applyLoad(fixtureContextAttacks());
    const stored = store.getState().attacks.find((a) => a.id === "atk_k");
    const raw = fixtureContextAttacks().find((a) => a.id === "atk_k");
    expect(stored?.severity).toBe(raw?.severity);
  });
});
