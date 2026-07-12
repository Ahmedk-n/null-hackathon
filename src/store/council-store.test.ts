// P3-T7 · store consumes the contextual analysis council's attacks at solve time.
//
// `fixtureCouncil` is a VALUE import from @/agents/council/fixtures — fine HERE (test files are
// excluded from the client/key-safety boundary guard, see src/store/boundary.test.ts's `isTest`
// filter), but the store itself (src/store/useKeystone.ts) must only ever type-import
// `CouncilResult`.
import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectCouncil } from "./useKeystone";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureDecisionContextPack,
  fixtureCompanyContext,
} from "@/context/fixtures";
import { reweightAttacksByContext } from "@/context/weights";
import { fixtureCouncil } from "@/agents/council/fixtures";

describe("store holds the council result", () => {
  it("setCouncil → selectCouncil round-trips it", () => {
    const store = createKeystoneStore();
    const council = fixtureCouncil("A");
    store.getState().setCouncil(council);
    expect(selectCouncil(store.getState())).toBe(council);
  });

  it("is reset to null by setGraph, but PERSISTS through reset()", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setCouncil(fixtureCouncil("A"));
    expect(selectCouncil(store.getState())).not.toBeNull();

    // setGraph: a NEW graph invalidates the council read against the old one.
    store.getState().setGraph(fixtureContextGraph());
    expect(selectCouncil(store.getState())).toBeNull();

    // reset() (the "Reset load" action): the graph/pack/company/findings the council describes
    // don't change on a load-reset, so the council must survive it — clearing it here would
    // wrongly downgrade the next Apply Load to the keyword fallback with no re-fetch.
    const council = fixtureCouncil("A");
    store.getState().setCouncil(council);
    store.getState().applyLoad(fixtureContextAttacks());
    store.getState().reset();
    expect(selectCouncil(store.getState())).toBe(council);
  });
});

describe("solve consumes contextualAttacks from a live grounded council", () => {
  it("with no council, applyLoad still uses reweightAttacksByContext (unchanged)", () => {
    const store = createKeystoneStore();
    const pack = fixtureDecisionContextPack();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), pack, "fixture");

    const raw = fixtureContextAttacks();
    store.getState().applyLoad(raw);

    const expected = reweightAttacksByContext(raw, pack.contextWeightAdjustments);
    expect(store.getState().attacks).toEqual(expected);
  });

  it("with a live grounded council present, applyLoad uses council.contextualAttacks instead", () => {
    const store = createKeystoneStore();
    const pack = fixtureDecisionContextPack();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), pack, "fixture");

    const council = { ...fixtureCouncil("A"), source: "live" as const };
    store.getState().setCouncil(council);

    const raw = fixtureContextAttacks();
    store.getState().applyLoad(raw);

    expect(store.getState().attacks).toEqual(council.contextualAttacks);
    // Sanity: this really did diverge from the plain keyword-reweight path.
    const wouldHaveBeen = reweightAttacksByContext(raw, pack.contextWeightAdjustments);
    expect(store.getState().attacks).not.toEqual(wouldHaveBeen);
  });

  it("a fixture-sourced council (not live) does NOT override — falls back to reweightAttacksByContext", () => {
    const store = createKeystoneStore();
    const pack = fixtureDecisionContextPack();
    store.getState().setGraph(fixtureContextGraph());
    store.getState().setContext(fixtureCompanyContext(), pack, "fixture");
    store.getState().setCouncil(fixtureCouncil("A")); // source: "fixture"

    const raw = fixtureContextAttacks();
    store.getState().applyLoad(raw);

    const expected = reweightAttacksByContext(raw, pack.contextWeightAdjustments);
    expect(store.getState().attacks).toEqual(expected);
  });
});
