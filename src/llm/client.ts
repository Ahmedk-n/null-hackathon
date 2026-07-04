// Live LLM chain (V3-4). extractStructure + generateAttacks are REAL calls.
//
// TRANSPORT (Wave B): each live call now goes through the forced-tool-call transport
// (src/llm/structured.ts::structuredCall) — a single FORCED tool call (`emit_graph` /
// `emit_attacks`) whose input schema is GraphSchema / AttacksSchema, validated by zod on return.
// This replaces the old free-text JSON scraping (messages.create → collectText →
// first-balanced-JSON → safeParse): the API returns schema-shaped `tool_use.input`. Everything
// downstream is UNCHANGED — the validate.ts repair wall, retryOnce, and fixture fallback.
//
// INVARIANTS (keystone-v3 §"Non-negotiable"):
//  - FIXTURES ALWAYS WIN when a `scenario` is passed (short-circuit precedes the live branch).
//  - Live fires ONLY when hasApiKey() AND no scenario. Offline-with-no-key demo stays byte-identical.
//  - Never 500 / never throw: every live path catches everything → fixture. fixture.ts is frozen.
//  - The validation wall (validate.ts) shape-checks/repairs live output before the pure engine sees it;
//    on any transport/validate failure the run() throws so retryOnce retries once, then catch → fixture.
import type { Attack, Graph } from "@/engine";
import { fixtureAttacks, fixtureGraph } from "./fixture";
import { AttacksSchema, GraphSchema } from "./schemas";
import { validateAttacks, validateGraph } from "./validate";
import { hasApiKey, structuredCall } from "./structured";
import type { ScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";
import {
  fixtureContextAttacks,
  fixtureContextAttacksB,
  fixtureContextAttacksR,
  fixtureContextGraph,
  fixtureContextGraphB,
  fixtureContextGraphR,
} from "@/context";
import { retryOnce } from "@/agents/retry";

/** Compact rendering of the decision-context pack for the live prompts. Tolerant of partial shapes. */
function renderPack(pack: unknown): string {
  const p = (pack ?? {}) as Partial<DecisionContextPack>;
  const lines: string[] = [];
  const list = (title: string, items?: string[]) => {
    if (items && items.length > 0) {
      lines.push(`${title}:`);
      for (const it of items) lines.push(`- ${it}`);
    }
  };
  list("RELEVANT BUSINESS FACTS", p.relevantBusinessFacts);
  list("RELEVANT TECHNICAL FACTS", p.relevantTechnicalFacts);
  list("RELEVANT TEMPORAL FACTS", p.relevantTemporalFacts);
  // V7-4 · feed the FULL pack. renderPack previously dropped the compiled constraints/
  // objectives/known-risks/missing-info before the model ever saw them — so extraction and
  // attacks reasoned against a hollow context. Rendering them lets the model ground assumptions
  // in the real constraints (and set them LOWER where a known risk stresses them) and lets the
  // adversary target the risks the company actually carries. Live-path only; engine-inert; no
  // fixture numbers move (fixtures short-circuit before any live call).
  if (p.relevantConstraints && p.relevantConstraints.length > 0) {
    lines.push("RELEVANT CONSTRAINTS:");
    for (const c of p.relevantConstraints) {
      lines.push(`- [${c.type}] ${c.statement} (severity ${c.severity})`);
    }
  }
  if (p.relevantObjectives && p.relevantObjectives.length > 0) {
    lines.push("RELEVANT OBJECTIVES:");
    for (const o of p.relevantObjectives) {
      lines.push(`- ${o.statement} (priority ${o.priority})`);
    }
  }
  if (p.relevantKnownRisks && p.relevantKnownRisks.length > 0) {
    lines.push("RELEVANT KNOWN RISKS:");
    for (const r of p.relevantKnownRisks) {
      lines.push(`- [${r.category}] ${r.statement} (likelihood ${r.likelihood}, severity ${r.severity})`);
    }
  }
  if (p.contextWeightAdjustments && p.contextWeightAdjustments.length > 0) {
    lines.push("CONTEXT WEIGHT ADJUSTMENTS:");
    for (const w of p.contextWeightAdjustments) {
      lines.push(`- ${w.targetCategory}: ${w.direction} ${w.magnitude} — ${w.reason}`);
    }
  }
  list("MISSING INFORMATION (unknowns — treat cited assumptions as weaker)", p.missingInformation);
  return lines.join("\n");
}

/**
 * A gathered fact threaded into extraction so the model can GROUND each confidence in real
 * evidence (V3-6). Deliberately mirrors the node `evidence` shape ({ source, fact }): the
 * orchestrator maps store gather findings (GatherFinding {label,value,source}) to this shape
 * (fact = `${label}: ${value}`) at the call site — a one-prop change. See renderFindings.
 */
export interface ExtractFinding {
  source: string;
  fact: string;
}

/** Compact rendering of gathered findings, each line citable verbatim as node evidence. */
function renderFindings(findings?: ExtractFinding[]): string {
  if (!findings || findings.length === 0) return "";
  return findings.map((f) => `- [${f.source}] ${f.fact}`).join("\n");
}

// ── EXTRACT ────────────────────────────────────────────────────────────────
const EXTRACT_SYSTEM = `You are Keystone's structural decomposer. Turn a founder's decision into a dependency
graph matching this JSON shape EXACTLY and return ONLY that JSON object (no prose):
{
  "thesisId": "<id of the SINGLE thesis node>",
  "nodes": [
    { "id": "snake_case_id", "type": "thesis" | "claim" | "assumption",
      "label": "<= 8 words", "confidence": 0.0-1.0,
      "groups": [ { "kind": "AND" | "OR", "childIds": ["<other node ids>"] } ],
      "evidence": [ { "source": "<file path / url / notes, VERBATIM from a finding>",
                      "fact": "<the cited finding>",
                      "stance": "supports" | "contradicts" } ] | null }
  ]
}

HARD RULES:
- EXACTLY ONE node of type "thesis", and "thesisId" MUST equal that node's id.
- Between 6 and 22 nodes total. All ids are snake_case and unique. GO GENUINELY DEEP where the
  reasoning has real depth: aim for 4-5 layers (thesis → 3-4 claims → 2-4 assumptions each →
  where natural, sub-assumptions or evidence-support nodes one or two levels further).
- Node types are only "thesis" | "claim" | "assumption".
- The thesis depends (via groups) on claims; claims depend on assumptions. An assumption MAY
  itself decompose — into sub-assumptions or first-class evidence-support nodes (also typed
  "assumption") — via its own groups where the belief genuinely rests on deeper sub-claims;
  otherwise a leaf assumption has "groups": []. Don't force depth where the reasoning is flat.
- Use AND groups when every child must hold; OR groups when any one child suffices (redundancy).
  Prefer AND groups of INDEPENDENT corroborating assumptions/evidence under a claim (the solver
  rewards honest breadth/depth of support instead of punishing it).
- confidence is each node's standalone solidity in [0,1]. GROUND every confidence in the supplied
  context pack: set it LOWER for assumptions the pack's facts actually stress, HIGHER where facts support them.

EVIDENCE & CONFIDENCE PROVENANCE (disarms "you invented these numbers"):
- "evidence" is an ARRAY. When GATHERED FINDINGS are supplied below, each ASSUMPTION SHOULD cite
  the 1-3 MOST RELEVANT findings, each as { "source": <the finding's source VERBATIM — file path,
  url, or "notes">, "fact": <the finding text>, "stance": "supports" | "contradicts" }. Prefer
  1-2 SUPPORTING citations; ADD a "contradicts" citation whenever a real finding argues AGAINST
  the assumption (conflicting evidence must surface, not be dropped). Never fabricate a source;
  copy one from the findings list exactly.
- Set confidence HIGHER (0.7–0.9) when the cited findings DIRECTLY support the assumption; LOWER
  (0.3–0.55) when findings are ABSENT or when a "contradicts" citation applies.
- An assumption with NO relevant finding MUST set "evidence": null. thesis/claim nodes set "evidence": null.

GROUND THE STRUCTURE IN CONTEXT. Make the assumptions COMPANY-SPECIFIC, not generic — prefer
assumptions the provided business/technical/temporal facts stress. When temporal context raises
timeline/execution/reliability/auditability weight, surface near-term delivery, operational-readiness,
and credibility assumptions. Do not invent facts absent from the pack.`;

/** One live extraction attempt: throws on any network/parse/schema/validate failure (retryOnce retries). */
async function extractRun(
  decisionText: string,
  pack: unknown,
  findings?: ExtractFinding[],
): Promise<Graph> {
  const packSummary = renderPack(pack);
  const findingsSummary = renderFindings(findings);
  const user = [
    `DECISION:\n${decisionText}`,
    packSummary ? `CONTEXT PACK:\n${packSummary}` : "",
    findingsSummary ? `GATHERED FINDINGS (cite the 1-3 most relevant per assumption; add a contradicting one where they conflict):\n${findingsSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const parsed = await structuredCall({
    system: EXTRACT_SYSTEM,
    user,
    schema: GraphSchema,
    toolName: "emit_graph",
    toolDescription: "Emit the decision dependency graph (thesis / claims / assumptions).",
  });
  const validated = validateGraph(parsed);
  if (!validated) throw new Error("graph failed validation wall");
  return validated;
}

/** Provenance of a produced result: "live" only when the model's answer passed the validation wall. */
export type Source = "live" | "fixture";
export interface GraphWithSource {
  graph: Graph;
  source: Source;
}

/**
 * extractStructure, but reporting provenance ADDITIVELY. `source` is "live" ONLY when the live
 * branch actually produced a schema-valid, wall-passing graph; a scenario pin, a missing key, or
 * ANY fixture fallback inside the live path all report "fixture". The graph itself is byte-identical
 * to what extractStructure returns for the same inputs — this is the same body, plus a tag.
 */
export async function extractStructureWithSource(
  decisionText: string,
  pack?: unknown,
  scenario?: ScenarioId,
  findings?: ExtractFinding[],
): Promise<GraphWithSource> {
  // Scenario routing takes precedence over pack presence: a pinned scenario must return ITS
  // fixture even when the caller supplies no pack (judges curl the API with just a scenario).
  // The base a_arch fixture remains the no-pack, no-scenario legacy path.
  const fallback = (): Graph =>
    scenario === "R"
      ? fixtureContextGraphR()
      : scenario === "B"
        ? fixtureContextGraphB()
        : scenario === "A"
          ? fixtureContextGraph()
          : !pack
            ? fixtureGraph()
            : fixtureContextGraph();
  // FIXTURES ALWAYS WIN when a scenario is pinned; live fires only with a key and no scenario.
  if (scenario) return { graph: fallback(), source: "fixture" };
  if (!hasApiKey()) return { graph: fallback(), source: "fixture" };
  try {
    return { graph: await retryOnce(() => extractRun(decisionText, pack, findings)), source: "live" };
  } catch {
    return { graph: fallback(), source: "fixture" };
  }
}

/** Existing signature (bare graph) — delegates to the provenance-carrying variant. Zero churn for callers. */
export async function extractStructure(
  decisionText: string,
  pack?: unknown,
  scenario?: ScenarioId,
  findings?: ExtractFinding[],
): Promise<Graph> {
  return (await extractStructureWithSource(decisionText, pack, scenario, findings)).graph;
}

// ── ATTACKS ──────────────────────────────────────────────────────────────
const ATTACK_SYSTEM = `You are Keystone's adversary. Given a dependency graph and the decision context, produce the
SINGLE strongest realistic attack on each VULNERABLE assumption — NOT every assumption. Return ONLY
this JSON object (no prose):
{ "attacks": [ { "id": "atk_<slug>", "targetId": "<an assumption id from the graph>",
                 "category": "<one of the allowed strings>", "severity": 0.0-1.0,
                 "rationale": "<one line, referencing the specific context pressure>" } ] }

HARD RULES:
- Produce 3 to 5 attacks total (the strongest, most realistic ones), at most one per assumption.
- "targetId" MUST be one of the assumption ids listed in the user message. Never target a thesis or claim.
- "severity" MUST be in [0.15, 0.55]. Raw severity alone must NOT collapse the structure — the
  downstream context reweighting is what tips a load-bearing assumption over the edge.
- "category" MUST be EXACTLY one of:
  "execution risk", "reliability", "auditability", "timeline", "market", "technical", "second-order".
- Raise severity (toward 0.55) on attacks whose category matches an INCREASED context weight
  (execution/timeline/reliability/auditability when a near-term event looms) and make the rationale
  reference that specific temporal pressure. Keep severities honest — strongest realistic, not most dramatic.`;

/** One live attack-gen attempt: throws on any network/parse/schema/validate failure (retryOnce retries). */
async function attacksRun(graph: Graph, pack: unknown): Promise<Attack[]> {
  const assumptionIds = graph.nodes.filter((n) => n.type === "assumption").map((n) => n.id);
  const assumptionLines = graph.nodes
    .filter((n) => n.type === "assumption")
    .map((n) => `- ${n.id}: ${n.label} (confidence ${n.confidence})`)
    .join("\n");
  const packSummary = renderPack(pack);
  const user = [
    `DECISION THESIS: ${graph.thesisId}`,
    `ASSUMPTION IDS (target only these): ${assumptionIds.join(", ")}`,
    `ASSUMPTIONS:\n${assumptionLines}`,
    packSummary ? `CONTEXT PACK:\n${packSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const parsed = await structuredCall({
    system: ATTACK_SYSTEM,
    user,
    schema: AttacksSchema,
    toolName: "emit_attacks",
    toolDescription: "Emit the strongest realistic attacks on the vulnerable assumptions.",
  });
  const validated = validateAttacks(graph, parsed.attacks);
  if (!validated) throw new Error("attacks failed validation wall");
  return validated;
}

export interface AttacksWithSource {
  attacks: Attack[];
  source: Source;
}

/**
 * generateAttacks, but reporting provenance ADDITIVELY. `source` is "live" ONLY when the live
 * branch actually produced a schema-valid, wall-passing attack set; scenario/no-key/any fallback
 * report "fixture". The attacks array is byte-identical to generateAttacks for the same inputs.
 */
export async function generateAttacksWithSource(
  graph: Graph,
  pack?: unknown,
  scenario?: ScenarioId,
): Promise<AttacksWithSource> {
  // Scenario routing precedes pack presence (see extractStructureWithSource).
  const fallback = (): Attack[] =>
    scenario === "R"
      ? fixtureContextAttacksR()
      : scenario === "B"
        ? fixtureContextAttacksB()
        : scenario === "A"
          ? fixtureContextAttacks()
          : !pack
            ? fixtureAttacks()
            : fixtureContextAttacks();
  if (scenario) return { attacks: fallback(), source: "fixture" };
  if (!hasApiKey()) return { attacks: fallback(), source: "fixture" };
  try {
    return { attacks: await retryOnce(() => attacksRun(graph, pack)), source: "live" };
  } catch {
    return { attacks: fallback(), source: "fixture" };
  }
}

/** Existing signature (bare attacks) — delegates to the provenance-carrying variant. Zero churn. */
export async function generateAttacks(
  graph: Graph,
  pack?: unknown,
  scenario?: ScenarioId,
): Promise<Attack[]> {
  return (await generateAttacksWithSource(graph, pack, scenario)).attacks;
}
