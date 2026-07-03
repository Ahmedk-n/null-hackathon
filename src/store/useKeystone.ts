import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Attack, Graph } from "@/engine";
import { applyAttacks, cloneGraph, detectFailures, integrity, keystone } from "@/engine";
// Pure, key-free transform (data-in/data-out). Safe to bundle client-side. This is the ONLY
// context import allowed in the store — never the compiler, the llm client, or the Anthropic SDK.
import { reweightAttacksByContext } from "@/context";
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
  loadApplied: boolean;
  failures: ReadonlySet<string>;
  companyContext: CompanyContext | null;
  decisionContextPack: DecisionContextPack | null;
  contextSource: "live" | "fixture" | null;
  applyContextWeights: boolean;
  // R2 (additive): GRAPH-tab node selection + 3D board tilt.
  selectedNodeId: string | null;
  tilt: boolean;
  setGraph: (g: Graph) => void;
  setConfidence: (id: string, value: number) => void;
  setContext: (
    companyContext: CompanyContext,
    decisionContextPack: DecisionContextPack,
    source: "live" | "fixture",
  ) => void;
  applyLoad: (attacks: Attack[]) => void;
  reset: () => void;
  setSelectedNode: (id: string | null) => void;
  setTilt: (tilt: boolean) => void;
}

export function createKeystoneStore() {
  return createStore<KeystoneState>((set, get) => ({
    baseGraph: null,
    workingGraph: null,
    attacks: [],
    loadApplied: false,
    failures: EMPTY_FAILURES,
    companyContext: null,
    decisionContextPack: null,
    contextSource: null,
    applyContextWeights: true,
    selectedNodeId: null,
    tilt: true,
    setGraph: (g) =>
      set({ baseGraph: cloneGraph(g), workingGraph: cloneGraph(g), attacks: [], loadApplied: false, failures: EMPTY_FAILURES }),
    setConfidence: (id, value) => {
      const wg = get().workingGraph;
      if (!wg) return;
      const next = cloneGraph(wg);
      const node = next.nodes.find((n) => n.id === id);
      if (node) node.confidence = Math.min(1, Math.max(0, value));
      // Re-derive failures only if we are in the post-load state; before load nothing is "failed".
      const failures = get().loadApplied ? detectFailures(next) : EMPTY_FAILURES;
      set({ workingGraph: next, failures });
    },
    setContext: (companyContext, decisionContextPack, source) =>
      set({ companyContext, decisionContextPack, contextSource: source }),
    applyLoad: (attacks) => {
      const wg = get().workingGraph;
      if (!wg) return;
      const { applyContextWeights, decisionContextPack } = get();
      // The ONLY place context math meets the engine: reweight severities BEFORE applyAttacks.
      const effective =
        applyContextWeights && decisionContextPack
          ? reweightAttacksByContext(attacks, decisionContextPack.contextWeightAdjustments)
          : attacks;
      const workingGraph = applyAttacks(wg, effective);
      set({ workingGraph, attacks: effective, loadApplied: true, failures: detectFailures(workingGraph) });
    },
    reset: () => {
      const base = get().baseGraph;
      if (!base) return;
      set({ workingGraph: cloneGraph(base), attacks: [], loadApplied: false, failures: EMPTY_FAILURES });
    },
    setSelectedNode: (id) => set({ selectedNodeId: id }),
    setTilt: (tilt) => set({ tilt }),
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
