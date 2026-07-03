import type { Attack, Graph } from "@/engine";
import { attacksReferenceIssues, graphReferenceIssues } from "@/engine";
import type { DecisionContextPack } from "@/context/types";
import { fixtureContextAttacks, fixtureContextGraph } from "@/context/fixtures";
import { AttacksSchema, GraphSchema, type AttacksOutput } from "./schemas";
import { fixtureAttacks, fixtureGraph } from "./fixture";
import { hasApiKey, structuredCall, withRetryFallback } from "./structured";

const EXTRACT_SYSTEM_BASE = [
  "You turn a startup/tech decision into a dependency structure.",
  "Output a graph: one 'thesis' node (the decision), 'claim' nodes it rests on,",
  "and 'assumption' leaf nodes the claims rest on.",
  "Every non-leaf node lists dependency groups; use 'AND' when all children are required,",
  "'OR' when any one suffices. Assumptions have empty groups.",
  "Set thesisId to the thesis node's id. Give each node a confidence in [0,1]:",
  "the thesis and claims are 1 (they inherit support); assumptions get an honest 0..1",
  "estimate of how solid they are on their own. Keep labels under 8 words.",
].join(" ");

const EXTRACT_SYSTEM_CONTEXT = [
  "\n\nGROUND THE STRUCTURE IN CONTEXT. You are given a DecisionContextPack with relevant",
  "business, technical, and temporal facts plus contextWeightAdjustments. Make the",
  "assumptions COMPANY-SPECIFIC, not generic. Prefer assumptions the provided facts actually",
  "stress. When temporal context raises timeline/execution/reliability/auditability weight,",
  "surface assumptions about near-term delivery, operational readiness, and credibility.",
  "Set an assumption's initial confidence LOWER when context suggests it is fragile.",
  "Do not invent facts absent from the pack.",
].join(" ");

const ATTACK_SYSTEM_BASE = [
  "You are an adversarial investor stress-testing a decision.",
  "For each assumption node, produce the single strongest realistic attack drawn from:",
  "market reality, competitor moves, execution risk, second-order effects, opportunity cost.",
  "Each attack: targetId (an assumption id that EXISTS in the graph), a category string,",
  "a severity in [0,1] (how much it undermines that assumption), and a one-sentence rationale.",
  "Return an 'attacks' array with a unique id per attack.",
].join(" ");

const ATTACK_SYSTEM_CONTEXT = [
  "\n\nUSE THE CONTEXT WEIGHT ADJUSTMENTS. Raise severity on attacks whose category matches an",
  "INCREASED weight (especially execution, timeline, reliability, auditability when a near-term",
  "event looms), and reference the specific temporal pressure in the rationale. Lower severity",
  "where a decreased weight applies. Keep severities honest — the strongest realistic attack.",
].join(" ");

function renderPack(pack: DecisionContextPack): string {
  const facts = [
    ...pack.relevantBusinessFacts,
    ...pack.relevantTechnicalFacts,
    ...pack.relevantTemporalFacts,
  ]
    .map((f) => `- ${f}`)
    .join("\n");
  const weights = pack.contextWeightAdjustments
    .map((w) => `- ${w.targetCategory}: ${w.direction} ${w.magnitude.toFixed(2)} — ${w.reason}`)
    .join("\n");
  return `Relevant context facts:\n${facts}\n\nContext weight adjustments:\n${weights}`;
}

/**
 * Decompose a decision into a Graph. If a pack is supplied the extraction is
 * context-grounded. Never throws: falls back to a fixture (the context hero
 * graph when a pack is present, else the base graph) on no key / failure.
 */
export async function extractStructure(
  decisionText: string,
  pack?: DecisionContextPack,
): Promise<Graph> {
  const fallback = (): Graph => (pack ? fixtureContextGraph() : fixtureGraph());
  if (!hasApiKey()) return fallback();

  const system = EXTRACT_SYSTEM_BASE + (pack ? EXTRACT_SYSTEM_CONTEXT : "");
  const user = pack ? `Decision: ${decisionText}\n\n${renderPack(pack)}` : decisionText;

  return withRetryFallback(
    async () => {
      const graph = await structuredCall<Graph>({
        system,
        user,
        schema: GraphSchema,
        toolName: "emit_graph",
        toolDescription: "Emit the decision dependency graph.",
      });
      // Reject referentially-broken graphs (dangling childIds, missing thesis) so
      // they fall back to a fixture instead of reaching the engine as garbage.
      const issues = graphReferenceIssues(graph);
      if (issues.length > 0) throw new Error(`malformed graph: ${issues.join("; ")}`);
      return graph;
    },
    fallback,
  );
}

/**
 * Generate adversarial attacks for a graph's assumptions. Context-aware when a
 * pack is supplied. Never throws: falls back to fixture attacks.
 */
export async function generateAttacks(
  graph: Graph,
  pack?: DecisionContextPack,
): Promise<Attack[]> {
  const fallback = (): Attack[] => (pack ? fixtureContextAttacks() : fixtureAttacks());
  if (!hasApiKey()) return fallback();

  const summary = graph.nodes
    .filter((n) => n.type === "assumption")
    .map((n) => `${n.id}: ${n.label} (confidence ${n.confidence})`)
    .join("\n");
  const system = ATTACK_SYSTEM_BASE + (pack ? ATTACK_SYSTEM_CONTEXT : "");
  const user = pack
    ? `Decision assumptions:\n${summary}\n\n${renderPack(pack)}`
    : `Decision assumptions:\n${summary}`;

  return withRetryFallback<Attack[]>(
    async () => {
      const out: AttacksOutput = await structuredCall<AttacksOutput>({
        system,
        user,
        schema: AttacksSchema,
        toolName: "emit_attacks",
        toolDescription: "Emit adversarial attacks against the assumptions.",
      });
      // Reject attacks that target non-existent nodes so they fall back to a
      // fixture instead of silently no-op'ing against the graph.
      const issues = attacksReferenceIssues(out.attacks, graph);
      if (issues.length > 0) throw new Error(`malformed attacks: ${issues.join("; ")}`);
      return out.attacks;
    },
    fallback,
  );
}
