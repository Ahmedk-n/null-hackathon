// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
// Fixture-only stub: returns the pre-baked fixtures directly and makes NO real Anthropic API calls.
// The `pack` argument is accepted (to match Founder A's signature) but ignored here.
import type { Attack, Graph } from "@/engine";
import { fixtureAttacks, fixtureGraph } from "./fixture";

export async function extractStructure(decisionText: string, pack?: unknown): Promise<Graph> {
  void decisionText;
  void pack;
  return fixtureGraph();
}

export async function generateAttacks(graph: Graph, pack?: unknown): Promise<Attack[]> {
  void graph;
  void pack;
  return fixtureAttacks();
}
