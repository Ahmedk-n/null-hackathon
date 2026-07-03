// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
// Fixture-only stub: returns pre-baked fixtures directly and makes NO real Anthropic API calls.
// §13 context-fallback behavior: when a `pack` is provided, return the 9-node context fixtures so
// the offline hero demo shows the grounded context graph/attacks; otherwise return the base fixtures.
import type { Attack, Graph } from "@/engine";
import { fixtureAttacks, fixtureGraph } from "./fixture";
import type { ScenarioId } from "@/context";
import {
  fixtureContextAttacks,
  fixtureContextAttacksB,
  fixtureContextGraph,
  fixtureContextGraphB,
} from "@/context";

export async function extractStructure(
  decisionText: string,
  pack?: unknown,
  scenario?: ScenarioId,
): Promise<Graph> {
  void decisionText;
  if (!pack) return fixtureGraph();
  // Scenario B routes to the "reinforce first" graph that holds; A (default) → hero.
  return scenario === "B" ? fixtureContextGraphB() : fixtureContextGraph();
}

export async function generateAttacks(
  graph: Graph,
  pack?: unknown,
  scenario?: ScenarioId,
): Promise<Attack[]> {
  void graph;
  if (!pack) return fixtureAttacks();
  return scenario === "B" ? fixtureContextAttacksB() : fixtureContextAttacks();
}
