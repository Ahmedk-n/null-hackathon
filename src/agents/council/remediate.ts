// Contextual analysis council — remediation agent (Phase 4).
//
// Stage 2 of the council: runs AFTER weigh (context-keystone) and debate (hidden assumptions)
// because it de-risks THEIR findings. Mirrors debateSkeptic (src/agents/council/debate.ts):
// hasApiKey() gate -> retryOnce(live run) -> live result; any failure (no key, network, schema,
// post-validation, or an empty remediations array) -> fixtureRemediations fallback. Never throws.
// ONE bounded structuredCall. `apiKey` is accepted for parity but not wired into the transport
// (structuredCall reads ANTHROPIC_API_KEY from env) — gating uses hasApiKey() only.
import type { Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";
import { hasApiKey, structuredCall } from "@/llm/structured";
import { RemediateSchema } from "@/llm/council-schemas";
import { retryOnce } from "@/agents/retry";
import { fixtureRemediations, scenarioForGraph } from "./fixtures";
import type { HiddenAssumption, Remediation } from "./types";
import type { WeighingFinding } from "./weigh";

const MAX_REMEDIATIONS = 4;

export interface RemediateResult {
  remediations: Remediation[];
  /** "live" ONLY on the successful live path (post-validation); "fixture" on no-key or any
   *  failure — lets runCouncil tag the action tail truthfully without demoting the diagnosis. */
  source: "live" | "fixture";
}

const REMEDIATE_SYSTEM = `You turn a decision's diagnosed weak points into ACTION. You are given the
real load-bearing assumption ("spine") and the hidden assumptions the situation conceals. For EACH,
emit ONE concrete, cheap experiment or piece of evidence that would falsify it BEFORE the decision is
committed — tailored to the company's real situation (timeline, competitors, constraints, findings).
If an imminent deadline exists, tailor the action to what to prove BEFORE it. Each remediation MUST:
set "kind" to "spine" (for the spine) or "hidden"; set "findingId" to the spine's node id or the
hidden assumption's exact label; put ONE actionable sentence in "action"; cite specific findings in
"evidenceRefs". Ground strictly in the supplied context; do not invent facts.

Return ONLY the emit_remediation tool call.`;

function renderPack(pack: DecisionContextPack): string {
  const lines: string[] = [`DECISION: ${pack.decision}`];
  if (pack.relevantTemporalFacts.length > 0) {
    lines.push("IMMINENT TEMPORAL FACTS:");
    for (const f of pack.relevantTemporalFacts) lines.push(`- ${f}`);
  }
  if (pack.relevantConstraints.length > 0) {
    lines.push("PACK CONSTRAINTS:");
    for (const c of pack.relevantConstraints) lines.push(`- [${c.id}] ${c.statement}`);
  }
  if (pack.relevantObjectives.length > 0) {
    lines.push("PACK OBJECTIVES:");
    for (const o of pack.relevantObjectives) lines.push(`- [${o.id}] ${o.statement}`);
  }
  if (pack.relevantKnownRisks.length > 0) {
    lines.push("PACK KNOWN RISKS:");
    for (const r of pack.relevantKnownRisks) lines.push(`- [${r.id}] ${r.statement}`);
  }
  return lines.join("\n");
}

function renderFindings(findings: readonly WeighingFinding[]): string {
  if (findings.length === 0) return "(no findings gathered)";
  return findings.map((f) => `- [${f.source ?? "unknown"}] ${f.fact ?? "(no fact recorded)"}`).join("\n");
}

/** One live remediation attempt: throws on any network/parse/schema failure (retryOnce retries). */
async function remediateRun(
  graph: Graph,
  pack: DecisionContextPack,
  contextKeystoneId: string | null,
  hiddenAssumptions: readonly HiddenAssumption[],
  findings: readonly WeighingFinding[],
): Promise<{ remediations: Remediation[] }> {
  const spineLabel =
    contextKeystoneId !== null
      ? graph.nodes.find((n) => n.id === contextKeystoneId)?.label ?? contextKeystoneId
      : "(no distinct spine)";
  const hiddenBlock =
    hiddenAssumptions.length > 0
      ? hiddenAssumptions.map((h) => `- ${h.label} — ${h.why}`).join("\n")
      : "(none)";

  const user = [
    `REAL SPINE (context-keystone): id=${contextKeystoneId ?? "null"} — ${spineLabel}`,
    `HIDDEN ASSUMPTIONS (findingId = the label verbatim):\n${hiddenBlock}`,
    `DECISION CONTEXT PACK:\n${renderPack(pack)}`,
    `GATHERED FINDINGS (cite via evidenceRefs):\n${renderFindings(findings)}`,
  ].join("\n\n");

  return structuredCall({
    schema: RemediateSchema,
    toolName: "emit_remediation",
    toolDescription: "Emit ONE concrete, cheap de-risking action per finding (spine + hidden).",
    system: REMEDIATE_SYSTEM,
    user,
  });
}

/**
 * Remediation seat: turns the council's diagnosis (real spine + hidden assumptions) into one
 * concrete, cheap falsifying test per finding. hasApiKey() gate -> retryOnce(live) ->
 * fixtureRemediations(scenarioForGraph(graph)) fallback on no-key, any failure, or an empty
 * result. Never throws; the no-key path makes no network call. `source` is truthful: "live" only
 * on the successful live path (post-validation), "fixture" on every fallback.
 *
 * `company` is accepted for interface parity with the other seats (its ids drive grounding in the
 * critic); the prompt draws situational detail from `pack`. `apiKey` is not wired into the
 * transport (see file header). Gating uses hasApiKey() only.
 */
export async function remediateFindings(
  graph: Graph,
  pack: DecisionContextPack,
  company: CompanyContext,
  contextKeystoneId: string | null,
  hiddenAssumptions: readonly HiddenAssumption[],
  findings: readonly WeighingFinding[],
  apiKey?: string,
): Promise<RemediateResult> {
  void company;
  void apiKey;

  const fallback = (): RemediateResult => ({
    remediations: fixtureRemediations(scenarioForGraph(graph)),
    source: "fixture",
  });

  if (!hasApiKey()) return fallback();

  try {
    const result = await retryOnce(() =>
      remediateRun(graph, pack, contextKeystoneId, hiddenAssumptions, findings),
    );
    // Post-validation wall: an empty remediations array is a failed generation -> fixture.
    if (result.remediations.length === 0) return fallback();
    const remediations: Remediation[] = result.remediations
      .slice(0, MAX_REMEDIATIONS)
      .map((r) => ({
        findingId: r.findingId,
        kind: r.kind,
        action: r.action,
        evidenceRefs: r.evidenceRefs,
      }));
    return { remediations, source: "live" };
  } catch {
    return fallback();
  }
}
