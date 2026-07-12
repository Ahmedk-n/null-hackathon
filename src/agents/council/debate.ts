// Contextual analysis council — skeptic debate agent (Phase 3, Task 4).
//
// Mirrors weighContext/stressContext exactly (src/agents/council/weigh.ts, stress.ts):
// hasApiKey() gate -> retryOnce(live run) -> live result; any failure (no key, network,
// schema, or post-validation, including an empty fractureNarrative) -> fixtureCouncil
// fallback. Never throws. ONE bounded structuredCall — no multi-turn duel for v1.
import type { Graph } from "@/engine";
import type { DecisionContextPack } from "@/context";
import { hasApiKey, structuredCall } from "@/llm/structured";
import { SkepticSchema } from "@/llm/council-schemas";
import { retryOnce } from "@/agents/retry";
import { fixtureCouncil, scenarioForGraph } from "./fixtures";
import type { HiddenAssumption } from "./types";
import type { WeighingFinding } from "./weigh";

const MAX_HIDDEN_ASSUMPTIONS = 3;

export interface DebateSkepticResult {
  hiddenAssumptions: HiddenAssumption[];
  fractureNarrative: string;
}

const SKEPTIC_SYSTEM = `You run an adversarial wind tunnel on this decision. First argue FOR it, then
attack it as a hard skeptic grounded in the company's real situation (constraints, timeline,
competitors, known risks, findings). Output: (1) the 1–3 UNSTATED assumptions the situation
hides — the ones that, if wrong, quietly sink this — each with a "why" and "evidenceRefs" citing
specific findings; (2) a one-sentence "fractureNarrative" naming the true fracture point given
this situation (e.g. 'your Series-A timeline makes X the real fracture point'). Ground strictly
in the supplied context; do not invent facts.

Return ONLY the emit_skeptic tool call.`;

function renderGraph(graph: Graph): string {
  return graph.nodes.map((n) => `- ${n.id} [${n.type}]: ${n.label}`).join("\n");
}

function renderPack(pack: DecisionContextPack): string {
  const lines: string[] = [`DECISION: ${pack.decision}`];
  if (pack.relevantConstraints.length > 0) {
    lines.push("PACK CONSTRAINTS:");
    for (const c of pack.relevantConstraints) {
      lines.push(`- [${c.id}] (${c.type}) ${c.statement} (severity ${c.severity})`);
    }
  }
  if (pack.relevantObjectives.length > 0) {
    lines.push("PACK OBJECTIVES:");
    for (const o of pack.relevantObjectives) {
      lines.push(`- [${o.id}] ${o.statement} (priority ${o.priority})`);
    }
  }
  if (pack.relevantKnownRisks.length > 0) {
    lines.push("PACK KNOWN RISKS:");
    for (const r of pack.relevantKnownRisks) {
      lines.push(`- [${r.id}] (${r.category}) ${r.statement} (likelihood ${r.likelihood}, severity ${r.severity})`);
    }
  }
  if (pack.contextWeightAdjustments.length > 0) {
    lines.push("CONTEXT WEIGHT ADJUSTMENTS:");
    for (const w of pack.contextWeightAdjustments) {
      lines.push(`- ${w.targetCategory}: ${w.direction} ${w.magnitude} — ${w.reason}`);
    }
  }
  return lines.join("\n");
}

function renderFindings(findings: readonly WeighingFinding[]): string {
  if (findings.length === 0) return "(no findings gathered)";
  return findings.map((f) => `- [${f.source ?? "unknown"}] ${f.fact ?? "(no fact recorded)"}`).join("\n");
}

/** One live skeptic-debate attempt: throws on any network/parse/schema failure (retryOnce retries). */
async function debateRun(
  graph: Graph,
  pack: DecisionContextPack,
  findings: readonly WeighingFinding[],
): Promise<DebateSkepticResult> {
  const user = [
    `GRAPH NODES (only reference these ids):\n${renderGraph(graph)}`,
    `DECISION CONTEXT PACK:\n${renderPack(pack)}`,
    `GATHERED FINDINGS (cite via evidenceRefs):\n${renderFindings(findings)}`,
  ].join("\n\n");

  return structuredCall({
    schema: SkepticSchema,
    toolName: "emit_skeptic",
    toolDescription: "Emit the hidden assumptions the situation conceals and the true fracture point.",
    system: SKEPTIC_SYSTEM,
    user,
  });
}

/**
 * Skeptic debate: a grounded proposer-vs-skeptic wind tunnel over this decision, surfacing the
 * 1–3 unstated assumptions the situation hides (each grounded in a finding) and a one-sentence
 * fracture narrative naming the true fracture point given the company's real situation.
 *
 * hasApiKey() gate -> retryOnce(live) -> fixtureCouncil(scenarioForGraph(graph)) fallback on
 * no-key, any failure, or an empty fractureNarrative. Never throws; the no-key path makes no
 * network call.
 *
 * `apiKey` is accepted for interface parity with the brief's signature but is NOT wired into
 * the transport: `structuredCall` always reads `ANTHROPIC_API_KEY` from the environment, so an
 * explicit override has no effect here — same convention as `weighContext`/`stressContext`.
 * Gating uses `hasApiKey()` only.
 */
export async function debateSkeptic(
  graph: Graph,
  pack: DecisionContextPack,
  findings: readonly WeighingFinding[],
  apiKey?: string,
): Promise<DebateSkepticResult> {
  void apiKey;

  const fallback = (): DebateSkepticResult => {
    const council = fixtureCouncil(scenarioForGraph(graph));
    return { hiddenAssumptions: council.hiddenAssumptions, fractureNarrative: council.fractureNarrative };
  };

  if (!hasApiKey()) return fallback();

  try {
    const result = await retryOnce(() => debateRun(graph, pack, findings));
    // Post-validation wall: cap hiddenAssumptions at MAX_HIDDEN_ASSUMPTIONS; an empty
    // fractureNarrative is treated as a failed generation -> fixture fallback.
    if (result.fractureNarrative.trim().length === 0) return fallback();
    const hiddenAssumptions: HiddenAssumption[] = result.hiddenAssumptions
      .slice(0, MAX_HIDDEN_ASSUMPTIONS)
      .map((a) => ({ label: a.label, why: a.why, evidenceRefs: a.evidenceRefs }));
    return { hiddenAssumptions, fractureNarrative: result.fractureNarrative };
  } catch {
    return fallback();
  }
}
