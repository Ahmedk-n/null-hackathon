import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Attack, Graph } from "@/engine";
import { applyAttacks, cloneGraph, detectFailures, integrity, keystone } from "@/engine";
// Pure, key-free transform (data-in/data-out). Safe to bundle client-side. This is the ONLY
// context import allowed in the store — never the compiler, the llm client, or the Anthropic SDK.
import { reweightAttacksByContext } from "@/context";
import type { CompanyContext, DecisionContextPack } from "@/context";

export interface KeystoneState {
  baseGraph: Graph | null;
  workingGraph: Graph | null;
  attacks: Attack[];
  loadApplied: boolean;
  companyContext: CompanyContext | null;
  decisionContextPack: DecisionContextPack | null;
  contextSource: "live" | "fixture" | null;
  applyContextWeights: boolean;
  setGraph: (g: Graph) => void;
  setConfidence: (id: string, value: number) => void;
  setContext: (
    companyContext: CompanyContext,
    decisionContextPack: DecisionContextPack,
    source: "live" | "fixture",
  ) => void;
  applyLoad: (attacks: Attack[]) => void;
  reset: () => void;
}

export function createKeystoneStore() {
  return createStore<KeystoneState>((set, get) => ({
    baseGraph: null,
    workingGraph: null,
    attacks: [],
    loadApplied: false,
    companyContext: null,
    decisionContextPack: null,
    contextSource: null,
    applyContextWeights: true,
    setGraph: (g) => set({ baseGraph: cloneGraph(g), workingGraph: cloneGraph(g), attacks: [], loadApplied: false }),
    setConfidence: (id, value) => {
      const wg = get().workingGraph;
      if (!wg) return;
      const next = cloneGraph(wg);
      const node = next.nodes.find((n) => n.id === id);
      if (node) node.confidence = Math.min(1, Math.max(0, value));
      set({ workingGraph: next });
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
      set({ workingGraph: applyAttacks(wg, effective), attacks: effective, loadApplied: true });
    },
    reset: () => {
      const base = get().baseGraph;
      if (!base) return;
      set({ workingGraph: cloneGraph(base), attacks: [], loadApplied: false });
    },
  }));
}

export const selectIntegrity = (s: KeystoneState): number => (s.workingGraph ? integrity(s.workingGraph) : 0);
export const selectKeystoneId = (s: KeystoneState): string | null => (s.workingGraph ? keystone(s.workingGraph)?.id ?? null : null);
export const selectFailures = (s: KeystoneState): Set<string> => (s.workingGraph && s.loadApplied ? detectFailures(s.workingGraph) : new Set());

// Shared singleton for the React app.
export const keystoneStore = createKeystoneStore();
export function useKeystone<T>(selector: (s: KeystoneState) => T): T {
  return useStore(keystoneStore, selector);
}
