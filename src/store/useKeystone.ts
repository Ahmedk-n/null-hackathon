import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Attack, Graph } from "@/engine";
import { applyAttacks, cloneGraph, detectFailures, integrity, keystone } from "@/engine";

export interface KeystoneState {
  baseGraph: Graph | null;
  workingGraph: Graph | null;
  attacks: Attack[];
  loadApplied: boolean;
  setGraph: (g: Graph) => void;
  setConfidence: (id: string, value: number) => void;
  applyLoad: (attacks: Attack[]) => void;
  reset: () => void;
}

export function createKeystoneStore() {
  return createStore<KeystoneState>((set, get) => ({
    baseGraph: null,
    workingGraph: null,
    attacks: [],
    loadApplied: false,
    setGraph: (g) => set({ baseGraph: cloneGraph(g), workingGraph: cloneGraph(g), attacks: [], loadApplied: false }),
    setConfidence: (id, value) => {
      const wg = get().workingGraph;
      if (!wg) return;
      const next = cloneGraph(wg);
      const node = next.nodes.find((n) => n.id === id);
      if (node) node.confidence = Math.min(1, Math.max(0, value));
      set({ workingGraph: next });
    },
    applyLoad: (attacks) => {
      const wg = get().workingGraph;
      if (!wg) return;
      set({ workingGraph: applyAttacks(wg, attacks), attacks, loadApplied: true });
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
