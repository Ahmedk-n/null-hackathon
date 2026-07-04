import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectIntegrity, selectKeystoneId, selectFailures } from "./useKeystone";
import { integrity, keystone } from "@/engine";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureCompanyContext,
  fixtureDecisionContextPack,
  fixtureContextGraphB,
  fixtureContextAttacksB,
  fixtureCompanyContextB,
  fixtureDecisionContextPackB,
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

  // ── V3-2 · minimum-reinforcement ──────────────────────────────────────
  it("reinforce lifts the grounded collapse back above the failure line", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());

    // Grounded collapse: below the line, keystone failed.
    expect(selectIntegrity(store.getState())).toBeLessThan(35);
    const failedBefore = selectFailures(store.getState()).size;
    expect(failedBefore).toBeGreaterThan(0);

    store.getState().reinforce();

    const plan = store.getState().reinforcementPlan;
    expect(plan).not.toBeNull();
    expect(plan!.targetIds.length).toBeGreaterThan(0);
    expect(plan!.targetIds).toContain("k_credible");
    // Working graph now crosses the threshold and failures shrink.
    expect(selectIntegrity(store.getState())).toBeGreaterThanOrEqual(35);
    expect(selectFailures(store.getState()).size).toBeLessThan(failedBefore);
    expect(store.getState().loadApplied).toBe(true);
  });

  it("toggling the attack basis after reinforce clears the stale plan", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());
    store.getState().reinforce();
    expect(store.getState().reinforcementPlan).not.toBeNull();

    // Flipping to raw re-derives from stored raw state — the plan no longer describes it.
    store.getState().setApplyContextWeights(false);
    expect(store.getState().reinforcementPlan).toBeNull();
  });

  it("reset clears the reinforcement plan", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());
    store.getState().reinforce();
    expect(store.getState().reinforcementPlan).not.toBeNull();
    store.getState().reset();
    expect(store.getState().reinforcementPlan).toBeNull();
  });

  // ── V3-7 · time-axis stress ────────────────────────────────────────────
  it("applyLoad derives failsInDay GROUNDED (hero A → 9) and resets the scrub", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());
    expect(store.getState().failsInDay).toBe(9);
    expect(store.getState().timelineDay).toBe(0);
  });

  it("RAW mode has no time axis (failsInDay = null)", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());
    expect(store.getState().failsInDay).toBe(9);
    store.getState().setApplyContextWeights(false);
    expect(store.getState().failsInDay).toBeNull();
    store.getState().setApplyContextWeights(true);
    expect(store.getState().failsInDay).toBe(9);
  });

  it("setTimelineDay re-runs the engine live — integrity craters as the deadline nears", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());

    store.getState().setTimelineDay(0); // deadline a fortnight out → raw-ish, structure holds
    const early = selectIntegrity(store.getState());
    store.getState().setTimelineDay(13); // deadline imminent → full collapse
    const late = selectIntegrity(store.getState());
    expect(early).toBeGreaterThan(late);
    expect(late).toBeLessThan(10);
    expect(store.getState().timelineDay).toBe(13);

    // Deterministic: same day → same verdict.
    store.getState().setTimelineDay(0);
    expect(selectIntegrity(store.getState())).toBe(early);
  });

  it("reinforce composes with the time axis — FAILS IN N DAYS flips to SURVIVES", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    store.getState().applyLoad(fixtureContextAttacks());
    expect(store.getState().failsInDay).toBe(9);

    store.getState().reinforce();
    expect(store.getState().failsInDay).toBeNull(); // reinforced structure clears the crater line

    // Scrubbing rebuilds from raw attacks (drops the plan) and re-derives the horizon.
    store.getState().setTimelineDay(5);
    expect(store.getState().reinforcementPlan).toBeNull();
    expect(store.getState().failsInDay).toBe(9);
  });

  it("scenario B survives the horizon (failsInDay null)", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraphB());
    store.getState().setContext(fixtureCompanyContextB(), fixtureDecisionContextPackB(), "fixture");
    store.getState().applyLoad(fixtureContextAttacksB());
    expect(store.getState().failsInDay).toBeNull();
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

// ── V5-3 · GRAPH EDITING ────────────────────────────────────────────────────
describe("keystone store (graph editing — V5-3)", () => {
  const node = (id: string) => (s: ReturnType<ReturnType<typeof createKeystoneStore>["getState"]>) =>
    s.baseGraph!.nodes.find((n) => n.id === id);

  it("renameNode is non-structural: preserves applied load, marks provenance modified", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());
    expect(store.getState().loadApplied).toBe(true);

    store.getState().renameNode("k_credible", "Reworded keystone");

    // Stress state SURVIVES a rename (not a structural edit).
    expect(store.getState().loadApplied).toBe(true);
    const n = store.getState().baseGraph!.nodes.find((x) => x.id === "k_credible")!;
    expect(n.label).toBe("Reworded keystone");
    expect(n.provenance).toBe("modified");
    // Mirrored onto the (attacked) working graph.
    expect(store.getState().workingGraph!.nodes.find((x) => x.id === "k_credible")!.label).toBe(
      "Reworded keystone",
    );
    expect(store.getState().editError).toBeNull();
  });

  it("renameNode rejects an unknown node with editError, state untouched", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().renameNode("nope", "x");
    expect(store.getState().editError).not.toBeNull();
    expect(store.getState().baseGraph!.nodes).toHaveLength(13);
  });

  it("deleteNode is structural: removes the node and RESETS the stress verdict to baseline", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());
    expect(store.getState().loadApplied).toBe(true);

    store.getState().deleteNode("a_load");

    expect(store.getState().loadApplied).toBe(false);
    expect(store.getState().attacks).toEqual([]);
    expect(store.getState().rawAttacks).toEqual([]);
    expect(store.getState().reinforcementPlan).toBeNull();
    expect(store.getState().failsInDay).toBeNull();
    expect(store.getState().baseGraph!.nodes.map((n) => n.id)).not.toContain("a_load");
    // Working graph rebuilt from the edited base → integrity re-derived at baseline (holds).
    expect(selectIntegrity(store.getState())).toBeGreaterThan(55);
  });

  it("deleteNode cascades: removing a claim prunes its now-orphaned subtree", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    // c_roi is the only parent of a_bound + a_load → deleting it orphans both, and a_bound's
    // own sub-leaves (s_domain, s_split) cascade too: 13 − {c_roi, a_bound, a_load, s_domain, s_split} = 8.
    store.getState().deleteNode("c_roi");
    const ids = store.getState().baseGraph!.nodes.map((n) => n.id);
    expect(ids).not.toContain("c_roi");
    expect(ids).not.toContain("a_bound");
    expect(ids).not.toContain("a_load");
    expect(ids).not.toContain("s_domain");
    expect(ids).not.toContain("s_split");
    expect(ids).toHaveLength(8);
    expect(store.getState().editError).toBeNull();
  });

  it("deleteNode refuses to delete the thesis (editError, state untouched)", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().deleteNode("T");
    expect(store.getState().editError).toMatch(/thesis/i);
    expect(store.getState().baseGraph!.nodes).toHaveLength(13);
  });

  it("addAssumption appends to the parent claim's AND group, slugified + provenance modified", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());

    store.getState().addAssumption("c_exec", "Team has migration experience");

    const created = node("team-has-migration-experience")(store.getState());
    expect(created).toBeDefined();
    expect(created!.type).toBe("assumption");
    expect(created!.provenance).toBe("modified");
    expect(created!.confidence).toBe(0.5);
    // Appended to c_exec's first AND group.
    const cExec = node("c_exec")(store.getState())!;
    expect(cExec.groups[0].kind).toBe("AND");
    expect(cExec.groups[0].childIds).toContain("team-has-migration-experience");
    // Structural → stress reset + auto-selects the new node.
    expect(store.getState().loadApplied).toBe(false);
    expect(store.getState().selectedNodeId).toBe("team-has-migration-experience");
  });

  it("addAssumption de-duplicates ids with a numeric suffix", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().addAssumption("c_exec", "Same label");
    store.getState().addAssumption("c_exec", "Same label");
    const ids = store.getState().baseGraph!.nodes.map((n) => n.id);
    expect(ids).toContain("same-label");
    expect(ids).toContain("same-label-2");
  });

  it("addAssumption rejects a non-claim/thesis parent (editError)", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().addAssumption("k_credible", "child of an assumption");
    expect(store.getState().editError).toMatch(/claim|thesis/i);
    expect(store.getState().baseGraph!.nodes).toHaveLength(13);
  });

  it("addAssumption rejects past the manual node cap (25) with editError", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph()); // 13 nodes
    // Add until the cap bites. 13 + 12 = 25 (ok); the 13th (→26) is rejected.
    for (let i = 0; i < 20; i++) store.getState().addAssumption("c_exec", `Extra ${i}`);
    expect(store.getState().editError).not.toBeNull();
    expect(store.getState().baseGraph!.nodes).toHaveLength(25);
  });

  it("flipGroupKind flips AND↔OR, marks provenance, resets stress, re-verdicts live", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().applyLoad(fixtureContextAttacks());
    const before = selectIntegrity(store.getState());

    // Flip the thesis's AND (product of claims) → OR (max of claims): integrity should jump.
    store.getState().flipGroupKind("T", 0);

    expect(node("T")(store.getState())!.groups[0].kind).toBe("OR");
    expect(node("T")(store.getState())!.provenance).toBe("modified");
    expect(store.getState().loadApplied).toBe(false);
    // Live re-verdict from the pure engine off the rebuilt working graph.
    expect(selectIntegrity(store.getState())).toBeGreaterThan(before);
  });

  it("flipGroupKind rejects an out-of-range group index (editError)", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().flipGroupKind("T", 9);
    expect(store.getState().editError).not.toBeNull();
    expect(node("T")(store.getState())!.groups[0].kind).toBe("AND");
  });

  it("editError auto-clears on the next successful edit; clearEditError resets it", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().deleteNode("T"); // rejected → editError set
    expect(store.getState().editError).not.toBeNull();

    store.getState().renameNode("a_obs", "Renamed"); // succeeds → clears editError
    expect(store.getState().editError).toBeNull();

    store.getState().deleteNode("T"); // rejected again
    expect(store.getState().editError).not.toBeNull();
    store.getState().clearEditError();
    expect(store.getState().editError).toBeNull();
  });

  it("keystone recomputes after a structural edit (delete the keystone → new keystone)", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    expect(selectKeystoneId(store.getState())).toBe("k_credible");
    store.getState().deleteNode("k_credible");
    // The engine re-verdicts off the rebuilt graph: the keystone is no longer k_credible.
    expect(selectKeystoneId(store.getState())).not.toBe("k_credible");
    expect(store.getState().baseGraph!.nodes.map((n) => n.id)).not.toContain("k_credible");
  });
});
