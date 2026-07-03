import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Attack, Graph, ReinforcementPlan } from "@/engine";
import {
  applyAttacks,
  cloneGraph,
  detectFailures,
  FAILURE_THRESHOLD,
  integrity,
  keystone,
  minimalReinforcement,
} from "@/engine";
// Pure, key-free transform (data-in/data-out). Safe to bundle client-side. This is the ONLY
// context import allowed in the store — never the compiler, the llm client, or the Anthropic SDK.
import { reweightAttacksByContext } from "@/context/weights";
import type { CompanyContext, DecisionContextPack } from "@/context";

// Stable empty reference reused for the "no failures" case. Returning a fresh `new Set()` from a
// selector on every render breaks React 19's useSyncExternalStore (snapshot must be referentially
// stable) and causes "Maximum update depth exceeded" + hydration mismatch. `failures` therefore
// lives in state and is only rebuilt inside actions.
const EMPTY_FAILURES: ReadonlySet<string> = new Set();

export interface KeystoneState {
  baseGraph: Graph | null;
  workingGraph: Graph | null;
  attacks: Attack[];
  // The un-reweighted attacks last passed to applyLoad. Kept so the A/B toggle can
  // recompute raw⟷reweighted live without a round-trip to /api/attacks.
  rawAttacks: Attack[];
  loadApplied: boolean;
  failures: ReadonlySet<string>;
  companyContext: CompanyContext | null;
  decisionContextPack: DecisionContextPack | null;
  contextSource: "live" | "fixture" | null;
  applyContextWeights: boolean;
  // R2 (additive): GRAPH-tab node selection + 3D board tilt.
  selectedNodeId: string | null;
  tilt: boolean;
  // W2-2 (additive): deterministic re-run beat. `rerunConfirmed` drives the transient
  // "IDENTICAL ✓ DETERMINISTIC" chip; `rerunIdentical` is the dev-level equality verdict
  // (null = never re-run yet). Neither ever throws in the prod path.
  rerunConfirmed: boolean;
  rerunIdentical: boolean | null;
  // V3-2 (additive): the minimum-reinforcement prescription for the current attacked
  // structure. null until `reinforce()` fires; cleared by any action that rebuilds the
  // working graph (so the DE-RISKING PLAN panel never shows a stale plan).
  reinforcementPlan: ReinforcementPlan | null;
  setGraph: (g: Graph) => void;
  setConfidence: (id: string, value: number) => void;
  setContext: (
    companyContext: CompanyContext,
    decisionContextPack: DecisionContextPack,
    source: "live" | "fixture",
  ) => void;
  applyLoad: (attacks: Attack[]) => void;
  setApplyContextWeights: (value: boolean) => void;
  reset: () => void;
  setSelectedNode: (id: string | null) => void;
  setTilt: (tilt: boolean) => void;
  // W2-2 (additive): recompute the whole pipeline from the stored raw inputs and
  // assert the verdict is byte-identical (visible determinism).
  rerun: () => void;
  clearRerunConfirmed: () => void;
  // V3-2 (additive): run the minimum-reinforcement solver on the current attacked
  // structure and apply the prescribed confidence restores to the working graph.
  reinforce: () => void;
}

export function createKeystoneStore() {
  return createStore<KeystoneState>((set, get) => ({
    baseGraph: null,
    workingGraph: null,
    attacks: [],
    rawAttacks: [],
    loadApplied: false,
    failures: EMPTY_FAILURES,
    companyContext: null,
    decisionContextPack: null,
    contextSource: null,
    applyContextWeights: true,
    selectedNodeId: null,
    tilt: true,
    rerunConfirmed: false,
    rerunIdentical: null,
    reinforcementPlan: null,
    setGraph: (g) =>
      set({ baseGraph: cloneGraph(g), workingGraph: cloneGraph(g), attacks: [], rawAttacks: [], loadApplied: false, failures: EMPTY_FAILURES, reinforcementPlan: null }),
    setConfidence: (id, value) => {
      const wg = get().workingGraph;
      if (!wg) return;
      const next = cloneGraph(wg);
      const node = next.nodes.find((n) => n.id === id);
      if (node) node.confidence = Math.min(1, Math.max(0, value));
      // Re-derive failures only if we are in the post-load state; before load nothing is "failed".
      const failures = get().loadApplied ? detectFailures(next) : EMPTY_FAILURES;
      set({ workingGraph: next, failures, reinforcementPlan: null });
    },
    setContext: (companyContext, decisionContextPack, source) =>
      set({ companyContext, decisionContextPack, contextSource: source }),
    applyLoad: (attacks) => {
      const base = get().baseGraph ?? get().workingGraph;
      if (!base) return;
      const { applyContextWeights, decisionContextPack } = get();
      // The ONLY place context math meets the engine: reweight severities BEFORE applyAttacks.
      const effective =
        applyContextWeights && decisionContextPack
          ? reweightAttacksByContext(attacks, decisionContextPack.contextWeightAdjustments)
          : attacks;
      // Always apply against a clean baseline clone so re-applying (e.g. the A/B
      // toggle) never double-attacks an already-stressed graph.
      const workingGraph = applyAttacks(cloneGraph(base), effective);
      set({ workingGraph, attacks: effective, rawAttacks: attacks, loadApplied: true, failures: detectFailures(workingGraph), reinforcementPlan: null });
    },
    // A/B toggle: IGNORE CONTEXT (raw) ⟷ GROUND IN CONTEXT (reweighted). Flipping it
    // re-derives the outcome live from the stored raw attacks — no re-fetch needed.
    setApplyContextWeights: (value) => {
      const { loadApplied, rawAttacks, baseGraph, decisionContextPack } = get();
      if (!loadApplied || !baseGraph || rawAttacks.length === 0) {
        set({ applyContextWeights: value });
        return;
      }
      const effective =
        value && decisionContextPack
          ? reweightAttacksByContext(rawAttacks, decisionContextPack.contextWeightAdjustments)
          : rawAttacks;
      const workingGraph = applyAttacks(cloneGraph(baseGraph), effective);
      set({
        applyContextWeights: value,
        workingGraph,
        attacks: effective,
        failures: detectFailures(workingGraph),
        // Toggling the attack basis re-derives the outcome from raw state, so any prior
        // reinforcement no longer describes the graph on screen — clear it.
        reinforcementPlan: null,
      });
    },
    reset: () => {
      const base = get().baseGraph;
      if (!base) return;
      set({ workingGraph: cloneGraph(base), attacks: [], rawAttacks: [], loadApplied: false, failures: EMPTY_FAILURES, reinforcementPlan: null });
    },
    setSelectedNode: (id) => set({ selectedNodeId: id }),
    setTilt: (tilt) => set({ tilt }),
    // W2-2: re-execute the engine pipeline from the *stored raw inputs* (baseGraph +
    // rawAttacks + context flag/pack) and prove the verdict is byte-identical. The engine
    // is pure, so this recomputation is deterministic; we compare integrity/keystone/failures
    // and expose a boolean (dev-level assertion — never throws in the prod path).
    rerun: () => {
      const { baseGraph, workingGraph, rawAttacks, applyContextWeights, decisionContextPack, failures } = get();
      if (!baseGraph || !workingGraph) {
        set({ rerunConfirmed: true, rerunIdentical: null });
        return;
      }
      // Capture the current verdict before recomputing.
      const prevIntegrity = integrity(workingGraph);
      const prevKeystone = keystone(workingGraph)?.id ?? null;
      const prevFailures = failures;
      // Re-run the exact pipeline applyLoad uses, from the raw attacks.
      const effective =
        applyContextWeights && decisionContextPack
          ? reweightAttacksByContext(rawAttacks, decisionContextPack.contextWeightAdjustments)
          : rawAttacks;
      const nextGraph = applyAttacks(cloneGraph(baseGraph), effective);
      const nextFailures = detectFailures(nextGraph);
      const nextIntegrity = integrity(nextGraph);
      const nextKeystone = keystone(nextGraph)?.id ?? null;
      const identical =
        prevIntegrity === nextIntegrity &&
        prevKeystone === nextKeystone &&
        prevFailures.size === nextFailures.size &&
        [...prevFailures].every((id) => nextFailures.has(id));
      set({
        workingGraph: nextGraph,
        attacks: effective,
        failures: nextFailures,
        rerunIdentical: identical,
        rerunConfirmed: true,
        // Re-run rebuilds the working graph from the raw attacks (the attacked verdict),
        // discarding any applied reinforcement — drop the stale plan.
        reinforcementPlan: null,
      });
    },
    clearRerunConfirmed: () => set({ rerunConfirmed: false }),
    // V3-2 · MINIMUM-REINFORCEMENT. Recompute the effective attacks exactly as
    // applyLoad does (respect applyContextWeights + the context pack), run the pure
    // solver at the failure line (35 = FAILURE_THRESHOLD on the 0..100 integrity scale),
    // then apply the prescribed confidence restores to a fresh clone of the ATTACKED
    // graph. The engine — not the solver — recomputes integrity/failures from the result.
    reinforce: () => {
      const { baseGraph, rawAttacks, applyContextWeights, decisionContextPack } = get();
      if (!baseGraph || rawAttacks.length === 0) return;
      const effective =
        applyContextWeights && decisionContextPack
          ? reweightAttacksByContext(rawAttacks, decisionContextPack.contextWeightAdjustments)
          : rawAttacks;
      const plan = minimalReinforcement(baseGraph, effective, FAILURE_THRESHOLD * 100);
      // Rebuild the attacked graph, then heal the plan's assumptions back to base confidence.
      const workingGraph = applyAttacks(cloneGraph(baseGraph), effective);
      for (const id of plan.targetIds) {
        const node = workingGraph.nodes.find((n) => n.id === id);
        const baseNode = baseGraph.nodes.find((n) => n.id === id);
        if (node && baseNode) node.confidence = baseNode.confidence;
      }
      set({
        workingGraph,
        attacks: effective,
        loadApplied: true,
        failures: detectFailures(workingGraph),
        reinforcementPlan: plan,
      });
    },
  }));
}

export const selectIntegrity = (s: KeystoneState): number => (s.workingGraph ? integrity(s.workingGraph) : 0);
export const selectKeystoneId = (s: KeystoneState): string | null => (s.workingGraph ? keystone(s.workingGraph)?.id ?? null : null);
// Reads stable state — never allocates. Rebuilt only inside actions above.
export const selectFailures = (s: KeystoneState): ReadonlySet<string> => s.failures;

// Shared singleton for the React app.
export const keystoneStore = createKeystoneStore();
export function useKeystone<T>(selector: (s: KeystoneState) => T): T {
  return useStore(keystoneStore, selector);
}
