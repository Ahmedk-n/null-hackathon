// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
// Fixture-only stub: returns pre-baked fixtures directly and makes NO real Anthropic API calls.
// §13 context-fallback behavior: when a `pack` is provided, return the 9-node context fixtures so
// the offline hero demo shows the grounded context graph/attacks; otherwise return the base fixtures.
import type { Attack, Graph } from "@/engine";
import { fixtureAttacks, fixtureGraph } from "./fixture";
import { fixtureContextAttacks, fixtureContextGraph } from "@/context";

export async function extractStructure(decisionText: string, pack?: unknown): Promise<Graph> {
  void decisionText;
  return pack ? fixtureContextGraph() : fixtureGraph();
}

export async function generateAttacks(graph: Graph, pack?: unknown): Promise<Attack[]> {
  void graph;
  return pack ? fixtureContextAttacks() : fixtureAttacks();
}
