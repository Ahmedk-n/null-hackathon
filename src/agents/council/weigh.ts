// Contextual analysis council — SALC-style weighting agent (Phase 3, Task 2).
//
// Mirrors generateAttacks/generateAttacksWithSource exactly (src/llm/client.ts:273-321):
// hasApiKey() gate -> retryOnce(live run) -> live result; any failure (no key, network,
// schema, or post-validation) -> fixtureCouncil fallback. Never throws.
import type { Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";
import { hasApiKey, structuredCall } from "@/llm/structured";
import { WeightingSchema } from "@/llm/council-schemas";
import { retryOnce } from "@/agents/retry";
import { fixtureCouncil, scenarioForGraph } from "./fixtures";
import type { NodeWeighting } from "./types";

/**
 * A gathered fact threaded into the weighting prompt so every rationale can cite one
 * (evidenceRefs). Deliberately loose/optional — this agent only renders findings into the
 * prompt, it doesn't validate their shape, so any of the app's several finding shapes
 * (GatherFinding, ExtractFinding, ...) can be passed through as-is.
 */
export interface WeighingFinding {
  source?: string;
  fact?: string;
}

export interface WeighContextResult {
  nodeWeights: NodeWeighting[];
  contextKeystoneId: string | null;
}

const WEIGHTING_SYSTEM = `You are the weighting seat on Keystone's contextual analysis council.
Given this decision's structure (the dependency graph) plus the company's situation
(constraints, objectives, known risks, timeline) plus the gathered findings, judge how
LOAD-BEARING each node is FOR THIS SITUATION on a 0..1 scale — not generic importance. A node
that is structurally minor can be highly load-bearing right now if the situation makes it the
thing that will actually be tested (a deadline, a buyer requirement, a known risk); a
structurally central node can matter less if the situation doesn't stress it.

Name the context-keystone: the single node whose failure would most collapse the decision
GIVEN this situation. It may differ from the graph's own structurally-central node — that is
often the interesting finding, not a mistake.

Every rationale MUST cite a specific finding via evidenceRefs (use the finding's source string).
Ground strictly in the supplied pack and findings; do not invent facts. Only reference node ids
that actually appear in the supplied structure.

Return ONLY the emit_weighting tool call.`;

function renderGraph(graph: Graph): string {
  return graph.nodes.map((n) => `- ${n.id} [${n.type}]: ${n.label}`).join("\n");
}

function renderCompany(company: CompanyContext): string {
  const lines: string[] = [];
  if (company.constraints.length > 0) {
    lines.push("CONSTRAINTS:");
    for (const c of company.constraints) {
      lines.push(`- [${c.id}] (${c.type}) ${c.statement} (severity ${c.severity})`);
    }
  }
  if (company.objectives.length > 0) {
    lines.push("OBJECTIVES:");
    for (const o of company.objectives) {
      lines.push(`- [${o.id}] ${o.statement} (priority ${o.priority})`);
    }
  }
  if (company.knownRisks.length > 0) {
    lines.push("KNOWN RISKS:");
    for (const r of company.knownRisks) {
      lines.push(`- [${r.id}] (${r.category}) ${r.statement} (likelihood ${r.likelihood}, severity ${r.severity})`);
    }
  }
  lines.push(`OVERALL URGENCY: ${company.temporal.urgencyLevel}`);
  if (company.temporal.deadlines.length > 0) {
    lines.push("DEADLINES:");
    for (const d of company.temporal.deadlines) {
      lines.push(`- [${d.id}] ${d.title} (${d.dateDescription}) — if missed: ${d.consequenceIfMissed} (severity ${d.severity})`);
    }
  }
  if (company.temporal.upcomingEvents.length > 0) {
    lines.push("UPCOMING EVENTS:");
    for (const e of company.temporal.upcomingEvents) {
      lines.push(`- [${e.id}] ${e.title} (${e.dateDescription}) — ${e.relevanceToDecision} (importance ${e.importance})`);
    }
  }
  return lines.join("\n");
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

/** One live weighting attempt: throws on any network/parse/schema failure (retryOnce retries). */
async function weighRun(
  graph: Graph,
  pack: DecisionContextPack,
  company: CompanyContext,
  findings: readonly WeighingFinding[],
): Promise<{ nodeWeights: NodeWeighting[]; contextKeystoneId: string | null }> {
  const user = [
    `GRAPH NODES (only reference these ids):\n${renderGraph(graph)}`,
    `DECISION CONTEXT PACK:\n${renderPack(pack)}`,
    `COMPANY SITUATION:\n${renderCompany(company)}`,
    `GATHERED FINDINGS (cite via evidenceRefs):\n${renderFindings(findings)}`,
  ].join("\n\n");

  return structuredCall({
    schema: WeightingSchema,
    toolName: "emit_weighting",
    toolDescription: "Emit contextual node weightings and the context-keystone id.",
    system: WEIGHTING_SYSTEM,
    user,
  });
}

/**
 * SALC-style contextual weighting: judges how load-bearing each graph node is FOR THIS
 * SITUATION (0..1), and names the context-keystone — the node whose failure would most
 * collapse the decision given the company's situation, which may differ from the graph's
 * topological keystone.
 *
 * hasApiKey() gate -> retryOnce(live) -> fixtureCouncil(scenarioForGraph(graph)) fallback on
 * no-key or any failure. Never throws; the no-key path makes no network call.
 *
 * `apiKey` is accepted for interface parity with the brief's signature but is NOT wired into
 * the transport: `structuredCall` always reads `ANTHROPIC_API_KEY` from the environment, so an
 * explicit override has no effect here — same convention as `generateDrivers`
 * (src/llm/client.ts). Gating uses `hasApiKey()` only.
 */
export async function weighContext(
  graph: Graph,
  pack: DecisionContextPack,
  company: CompanyContext,
  findings: readonly WeighingFinding[],
  apiKey?: string,
): Promise<WeighContextResult> {
  void apiKey;

  const fallback = (): WeighContextResult => {
    const council = fixtureCouncil(scenarioForGraph(graph));
    return { nodeWeights: council.nodeWeights, contextKeystoneId: council.contextKeystoneId };
  };

  if (!hasApiKey()) return fallback();

  try {
    const result = await retryOnce(() => weighRun(graph, pack, company, findings));
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    // Post-validation wall: clamp contextWeight to [0,1], drop any weighting whose nodeId
    // isn't actually a node in the graph, and null out a hallucinated contextKeystoneId.
    const nodeWeights: NodeWeighting[] = result.nodeWeights
      .filter((w) => nodeIds.has(w.nodeId))
      .map((w) => ({
        nodeId: w.nodeId,
        contextWeight: Math.min(1, Math.max(0, w.contextWeight)),
        rationale: w.rationale,
        evidenceRefs: w.evidenceRefs,
      }));
    const contextKeystoneId =
      result.contextKeystoneId !== null && nodeIds.has(result.contextKeystoneId)
        ? result.contextKeystoneId
        : null;
    return { nodeWeights, contextKeystoneId };
  } catch {
    return fallback();
  }
}
