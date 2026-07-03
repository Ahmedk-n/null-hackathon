// Live LLM chain (V3-4). extractStructure + generateAttacks are REAL calls using the repo's
// proven-live pattern (business agent, verified live 2026-07-04): messages.parse/zodOutputFormat
// do NOT exist in @anthropic-ai/sdk@0.68.0, so we use
//   new Anthropic({ maxRetries: 0 }) → client.messages.create(..., { timeout })
//   → collectText → first-balanced-JSON extract → zod safeParse → validate wall → retryOnce → fixture.
//
// INVARIANTS (keystone-v3 §"Non-negotiable"):
//  - FIXTURES ALWAYS WIN when a `scenario` is passed (short-circuit precedes the live branch).
//  - Live fires ONLY when hasApiKey() AND no scenario. Offline-with-no-key demo stays byte-identical.
//  - Never 500 / never throw: every live path catches everything → fixture. fixture.ts is frozen.
//  - The validation wall (validate.ts) shape-checks/repairs live output before the pure engine sees it;
//    on any parse/validate failure the run() throws so retryOnce retries once, then the catch → fixture.
import Anthropic from "@anthropic-ai/sdk";
import type { Attack, Graph } from "@/engine";
import { fixtureAttacks, fixtureGraph } from "./fixture";
import { AttacksSchema, GraphSchema } from "./schemas";
import { validateAttacks, validateGraph } from "./validate";
import type { ScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";
import {
  fixtureContextAttacks,
  fixtureContextAttacksB,
  fixtureContextGraph,
  fixtureContextGraphB,
} from "@/context";
import { retryOnce } from "@/agents/retry";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 16_000;
// Hard per-request deadline so a slow live call can never freeze the demo. The SDK rejects with
// APIConnectionTimeoutError past this; the existing try/catch → fixture fallback handles it.
const REQUEST_TIMEOUT_MS = 45_000;

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Concatenate the text of all `text` content blocks (mirrors src/agents/schemas.ts::collectText). */
function collectText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      out.push((block as { text: string }).text);
    }
  }
  return out.join("\n");
}

/** First balanced JSON object from a free-text reply (first `{` … last `}`). Throws if none/invalid. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

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
  if (p.contextWeightAdjustments && p.contextWeightAdjustments.length > 0) {
    lines.push("CONTEXT WEIGHT ADJUSTMENTS:");
    for (const w of p.contextWeightAdjustments) {
      lines.push(`- ${w.targetCategory}: ${w.direction} ${w.magnitude} — ${w.reason}`);
    }
  }
  return lines.join("\n");
}

// ── EXTRACT ────────────────────────────────────────────────────────────────
const EXTRACT_SYSTEM = `You are Keystone's structural decomposer. Turn a founder's decision into a dependency
graph matching this JSON shape EXACTLY and return ONLY that JSON object (no prose):
{
  "thesisId": "<id of the SINGLE thesis node>",
  "nodes": [
    { "id": "snake_case_id", "type": "thesis" | "claim" | "assumption",
      "label": "<= 8 words", "confidence": 0.0-1.0,
      "groups": [ { "kind": "AND" | "OR", "childIds": ["<other node ids>"] } ] }
  ]
}

HARD RULES:
- EXACTLY ONE node of type "thesis", and "thesisId" MUST equal that node's id.
- Between 5 and 12 nodes total. All ids are snake_case and unique.
- Node types are only "thesis" | "claim" | "assumption".
- The thesis depends (via groups) on claims; claims depend on assumptions. Leaf assumptions have "groups": [].
- Use AND groups when every child must hold; OR groups when any one child suffices (redundancy).
- confidence is each node's standalone solidity in [0,1]. GROUND every confidence in the supplied
  context pack: set it LOWER for assumptions the pack's facts actually stress, HIGHER where facts support them.

GROUND THE STRUCTURE IN CONTEXT. Make the assumptions COMPANY-SPECIFIC, not generic — prefer
assumptions the provided business/technical/temporal facts stress. When temporal context raises
timeline/execution/reliability/auditability weight, surface near-term delivery, operational-readiness,
and credibility assumptions. Do not invent facts absent from the pack.`;

/** One live extraction attempt: throws on any network/parse/schema/validate failure (retryOnce retries). */
async function extractRun(decisionText: string, pack: unknown): Promise<Graph> {
  const client = new Anthropic({ maxRetries: 0 });
  const packSummary = renderPack(pack);
  const user = packSummary
    ? `DECISION:\n${decisionText}\n\nCONTEXT PACK:\n${packSummary}`
    : `DECISION:\n${decisionText}`;
  const res = await client.messages.create(
    { model: MODEL, max_tokens: MAX_TOKENS, system: EXTRACT_SYSTEM, messages: [{ role: "user", content: user }] },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  const parsed = GraphSchema.safeParse(extractJson(collectText(res.content)));
  if (!parsed.success) throw new Error("graph failed schema");
  const validated = validateGraph(parsed.data);
  if (!validated) throw new Error("graph failed validation wall");
  return validated;
}

export async function extractStructure(
  decisionText: string,
  pack?: unknown,
  scenario?: ScenarioId,
): Promise<Graph> {
  const fallback = (): Graph =>
    !pack ? fixtureGraph() : scenario === "B" ? fixtureContextGraphB() : fixtureContextGraph();
  // FIXTURES ALWAYS WIN when a scenario is pinned; live fires only with a key and no scenario.
  if (scenario) return fallback();
  if (!hasApiKey()) return fallback();
  try {
    return await retryOnce(() => extractRun(decisionText, pack));
  } catch {
    return fallback();
  }
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
  const client = new Anthropic({ maxRetries: 0 });
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
  const res = await client.messages.create(
    { model: MODEL, max_tokens: MAX_TOKENS, system: ATTACK_SYSTEM, messages: [{ role: "user", content: user }] },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  const parsed = AttacksSchema.safeParse(extractJson(collectText(res.content)));
  if (!parsed.success) throw new Error("attacks failed schema");
  const validated = validateAttacks(graph, parsed.data.attacks);
  if (!validated) throw new Error("attacks failed validation wall");
  return validated;
}

export async function generateAttacks(
  graph: Graph,
  pack?: unknown,
  scenario?: ScenarioId,
): Promise<Attack[]> {
  const fallback = (): Attack[] =>
    !pack ? fixtureAttacks() : scenario === "B" ? fixtureContextAttacksB() : fixtureContextAttacks();
  if (scenario) return fallback();
  if (!hasApiKey()) return fallback();
  try {
    return await retryOnce(() => attacksRun(graph, pack));
  } catch {
    return fallback();
  }
}
