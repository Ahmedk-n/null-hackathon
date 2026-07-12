// Contextual analysis council — situation-specific stress/attack agent (Phase 3, Task 3).
//
// Mirrors weighContext (src/agents/council/weigh.ts, Task 2) exactly: hasApiKey() gate ->
// retryOnce(live run) -> live result; any failure (no key, network, schema, or
// post-validation) -> fixtureCouncil fallback. Never throws.
import type { Attack, Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";
import { hasApiKey, structuredCall } from "@/llm/structured";
import { AttacksSchema } from "@/llm/schemas";
import { retryOnce } from "@/agents/retry";
import { fixtureCouncil, scenarioForGraph } from "./fixtures";
import type { WeighingFinding } from "./weigh";

const MIN_SEVERITY = 0.15;
const MAX_SEVERITY = 0.55;
const MAX_ATTACKS = 8;

const STRESS_SYSTEM = `You are the stress-testing seat on Keystone's contextual analysis council.

Generate the failure modes THIS company actually faces — grounded in its real competitors,
timeline, constraints, objectives, known risks, and the gathered findings — NOT generic attack
categories.

Each attack targets a real assumption/claim id from the structure, "category" is a short slug,
"severity" is in [0.15, 0.55] (raw severity alone must not collapse the structure — the
downstream context reweighting is what tips a load-bearing node over the edge), and "rationale"
cites a specific finding. Only target node ids that appear in the structure.

Return ONLY the emit_context_stress tool call.`;

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

/** One live stress-gen attempt: throws on any network/parse/schema failure (retryOnce retries). */
async function stressRun(
  graph: Graph,
  pack: DecisionContextPack,
  company: CompanyContext,
  findings: readonly WeighingFinding[],
): Promise<Attack[]> {
  const user = [
    `GRAPH NODES (only reference these ids):\n${renderGraph(graph)}`,
    `DECISION CONTEXT PACK:\n${renderPack(pack)}`,
    `COMPANY SITUATION:\n${renderCompany(company)}`,
    `GATHERED FINDINGS (cite via rationale):\n${renderFindings(findings)}`,
  ].join("\n\n");

  const parsed = await structuredCall({
    schema: AttacksSchema,
    toolName: "emit_context_stress",
    toolDescription: "Emit situation-specific attacks grounded in the company's real context.",
    system: STRESS_SYSTEM,
    user,
  });
  return parsed.attacks;
}

/**
 * Situation-specific stress agent: generates failure modes THIS company actually faces —
 * grounded in its real competitors, timeline, constraints, objectives, known risks, and the
 * gathered findings — replacing generic attack categories.
 *
 * hasApiKey() gate -> retryOnce(live) -> fixtureCouncil(scenarioForGraph(graph)).contextualAttacks
 * fallback on no-key or any failure. Never throws; the no-key path makes no network call.
 *
 * `apiKey` is accepted for interface parity with the brief's signature but is NOT wired into
 * the transport: `structuredCall` always reads `ANTHROPIC_API_KEY` from the environment, so an
 * explicit override has no effect here — same convention as `weighContext`/`generateDrivers`.
 * Gating uses `hasApiKey()` only.
 */
export async function stressContext(
  graph: Graph,
  pack: DecisionContextPack,
  company: CompanyContext,
  findings: readonly WeighingFinding[],
  apiKey?: string,
): Promise<Attack[]> {
  void apiKey;

  const fallback = (): Attack[] => fixtureCouncil(scenarioForGraph(graph)).contextualAttacks;

  if (!hasApiKey()) return fallback();

  try {
    const result = await retryOnce(() => stressRun(graph, pack, company, findings));
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    // Post-validation wall: drop any attack whose targetId isn't actually a node in the
    // graph, clamp severity to [0.15, 0.55], synthesize a deterministic id for any attack
    // the model left unidentified, and cap the result at MAX_ATTACKS.
    const attacks: Attack[] = result
      .filter((a) => nodeIds.has(a.targetId))
      .slice(0, MAX_ATTACKS)
      .map((a, i) => ({
        id: a.id && a.id.length > 0 ? a.id : `ctx-${a.targetId}-${i}`,
        targetId: a.targetId,
        category: a.category,
        severity: Math.min(MAX_SEVERITY, Math.max(MIN_SEVERITY, a.severity)),
        rationale: a.rationale,
      }));
    return attacks;
  } catch {
    return fallback();
  }
}
