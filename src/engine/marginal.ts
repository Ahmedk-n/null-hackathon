// V7-3 · FIRM-UP PAYOFF — the marginal value of proving each assumption.
//
// Knock-out sensitivity (`rankLoadBearing`) asks "on the HEALTHY graph, which assumption,
// if it fails, takes everything down?". Minimum reinforcement (`minimalReinforcement`) asks
// "which SET is cheapest to prove so the structure survives?". This asks the third question
// the DE-RISKING readout needs: on the ATTACKED graph, how many integrity points does
// restoring THIS ONE assumption's base confidence buy back? — so each PROVE row can carry a
// concrete "+N%" and the plan can name the single highest-payoff assumption to firm up first.
//
// Pure engine: imports only ./types ./propagation ./sensitivity ./load (mirrors reinforce.ts).
// No context/llm/react/store. Fully deterministic — fixed iteration + a stable id tiebreak,
// no randomness, no wall-clock. The input graph is never mutated (applyAttacks/cloneGraph
// both clone).
import type { Attack, Graph } from "./types";
import { FAILURE_THRESHOLD, integrity } from "./propagation";
import { applyAttacks } from "./load";
import { cloneGraph } from "./sensitivity";

export interface MarginalGain {
  id: string;
  label: string;
  /** Integrity points regained by restoring THIS assumption's base confidence on the attacked graph (≥ 0). */
  gain: number;
  /** Integrity with only this assumption restored, 0..100. */
  integrityAfter: number;
  /** True if restoring this one assumption alone lifts integrity to/over `threshold`. */
  crossesThreshold: boolean;
}

/**
 * For every assumption, the integrity GAIN from restoring its base confidence on the
 * attacked graph — i.e. its individual firm-up payoff — ranked descending. Ties break by
 * id for determinism. `threshold` is on the 0..100 integrity scale (default = the failure
 * line). An un-attacked assumption yields gain 0 and ranks last.
 */
export function marginalReinforcement(
  baseGraph: Graph,
  attacks: Attack[],
  threshold: number = FAILURE_THRESHOLD * 100,
): MarginalGain[] {
  const attacked = applyAttacks(baseGraph, attacks);
  const integrityBefore = integrity(attacked);
  const results: MarginalGain[] = [];
  for (const node of baseGraph.nodes) {
    if (node.type !== "assumption") continue;
    const probe = cloneGraph(attacked);
    const target = probe.nodes.find((n) => n.id === node.id);
    if (!target) continue;
    // Restore this assumption's confidence to its healthy base value; everything else stays attacked.
    target.confidence = node.confidence;
    const integrityAfter = integrity(probe);
    results.push({
      id: node.id,
      label: node.label,
      gain: integrityAfter - integrityBefore,
      integrityAfter,
      crossesThreshold: integrityAfter >= threshold,
    });
  }
  results.sort((a, b) => b.gain - a.gain || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return results;
}
