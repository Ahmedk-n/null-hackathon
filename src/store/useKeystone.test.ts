import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectIntegrity, selectKeystoneId, selectFailures } from "./useKeystone";
import { integrity, keystone } from "@/engine";
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

  it("applyLoad drops integrity; RAW survives, context-grounded collapses", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    // RAW (context ignored, no pack): the keystone HOLDS — structure survives.
    store.getState().applyLoad(fixtureContextAttacks());
    expect(store.getState().loadApplied).toBe(true);
    expect(selectIntegrity(store.getState())).toBeLessThan(62); // dropped from baseline
    expect(selectIntegrity(store.getState())).toBeGreaterThan(15);
    expect(selectFailures(store.getState()).has("k_credible")).toBe(false);
    expect(selectKeystoneId(store.getState())).toBe("k_credible");

    // GROUNDED IN CONTEXT: the hero pack reweights the execution attack and the
    // keystone crosses the threshold — collapse.
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());
    expect(selectIntegrity(store.getState())).toBeLessThan(10);
    expect(selectFailures(store.getState()).has("k_credible")).toBe(true);
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
    // RAW attacks (no pack) survive at the keystone but crater the thesis, so the
    // populated failure set contains T — enough to prove stability of a non-empty set.
    expect(a.has("T")).toBe(true);
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

    // Reweight is applied: the execution-increase (magnitude 1.0) pushes atk_k above its raw 0.43.
    const stored = store.getState().attacks.find((a) => a.id === "atk_k");
    const raw = fixtureContextAttacks().find((a) => a.id === "atk_k");
    expect(stored?.severity).toBeGreaterThan(raw?.severity ?? 0);

    // The engine — not the LLM/context — still decides the keystone and the failures.
    expect(selectKeystoneId(store.getState())).toBe("k_credible");
    expect(selectFailures(store.getState()).has("k_credible")).toBe(true);
    expect(selectIntegrity(store.getState())).toBeLessThan(10);
  });

  it("setSelectedNode stores and clears the selection", () => {
    const store = createKeystoneStore();
    expect(store.getState().selectedNodeId).toBeNull();
    store.getState().setSelectedNode("k_credible");
    expect(store.getState().selectedNodeId).toBe("k_credible");
    store.getState().setSelectedNode(null);
    expect(store.getState().selectedNodeId).toBeNull();
  });

  it("tilt defaults on and toggles", () => {
    const store = createKeystoneStore();
    expect(store.getState().tilt).toBe(true);
    store.getState().setTilt(false);
    expect(store.getState().tilt).toBe(false);
    store.getState().setTilt(true);
    expect(store.getState().tilt).toBe(true);
  });

  // ── W2-2 · deterministic re-run beat ───────────────────────────────────
  it("rerun leaves integrity/keystone/failures byte-identical and confirms determinism", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());

    const beforeIntegrity = integrity(store.getState().workingGraph!);
    const beforeKeystone = keystone(store.getState().workingGraph!)?.id ?? null;
    const beforeFailures = [...selectFailures(store.getState())].sort();
    expect(store.getState().rerunConfirmed).toBe(false);
    expect(store.getState().rerunIdentical).toBeNull();

    store.getState().rerun();

    // Verdict is byte-identical after recomputing from the stored raw inputs.
    expect(integrity(store.getState().workingGraph!)).toBe(beforeIntegrity);
    expect(keystone(store.getState().workingGraph!)?.id ?? null).toBe(beforeKeystone);
    expect([...selectFailures(store.getState())].sort()).toEqual(beforeFailures);
    // Determinism verdict + confirmation flag are set.
    expect(store.getState().rerunIdentical).toBe(true);
    expect(store.getState().rerunConfirmed).toBe(true);

    // The chip flag can be cleared (component drives this via setTimeout).
    store.getState().clearRerunConfirmed();
    expect(store.getState().rerunConfirmed).toBe(false);
    expect(store.getState().rerunIdentical).toBe(true);
  });

  it("selection/tilt setters leave the failures snapshot referentially stable", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());
    const before = selectFailures(store.getState());
    store.getState().setSelectedNode("k_credible");
    store.getState().setTilt(false);
    expect(selectFailures(store.getState())).toBe(before);
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
