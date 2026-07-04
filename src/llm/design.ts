// V6-1 · GENERATIVE DECISION DESIGN (server module — never imported by a client file).
//
// designCandidates(goal, constraints, pack?, scenario?) synthesizes THREE rival Structures for the
// SAME goal — one per STRATEGY LENS (AGGRESSIVE / CONSERVATIVE / HYBRID) — and attacks each one so
// the pure engine (client-side) can pick the survivor. It follows the proven live pattern (see
// src/llm/client.ts): messages.create + first-balanced-JSON + zod safeParse + validateGraph wall +
// retryOnce, and it reuses the EXISTING attack path (generateAttacksWithSource) with the SAME pack
// so the three candidates are comparable BY CONSTRUCTION (same categories, same reweight, same wall).
//
// INVARIANTS (mirror the v3 live-chain guardrails):
//  - FIXTURES ALWAYS WIN when a scenario is passed (short-circuit before the live branch).
//  - Live fires ONLY when hasApiKey() AND no scenario. Offline/keyless demo → the pinned candidates.
//  - NEVER 500, NEVER fewer than 3 candidates: any lens that fails live → its pinned stand-in.
//  - The LLM never ranks; it only proposes shapes + attacks. Verdicts are the engine's, client-side.
import Anthropic from "@anthropic-ai/sdk";
import type { Attack, Graph } from "@/engine";
import { GraphSchema } from "./schemas";
import { validateGraph } from "./validate";
import { generateAttacksWithSource, type Source } from "./client";
import { retryOnce } from "@/agents/retry";
import type { DecisionContextPack, ScenarioId } from "@/context";
import { fixtureDesignCandidatesR, type DesignLens } from "@/context/fixtures";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 45_000;

export interface DesignCandidate {
  lens: DesignLens;
  label: string;
  graph: Graph;
  attacks: Attack[];
  /** Per-candidate provenance: "live" only when THIS lens produced a wall-passing graph. */
  source: Source;
}

export interface DesignResult {
  candidates: DesignCandidate[];
  /** Overall header provenance: "live" only when EVERY candidate is live. */
  source: Source;
}

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Concatenate the text of all `text` content blocks (mirrors client.ts::collectText). */
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

/** First balanced JSON object from a free-text reply. Throws if none/invalid. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

/** Compact rendering of the pack for the design prompt (tolerant of partial shapes). */
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

// The extract contract (mirrors client.ts EXTRACT_SYSTEM) + a lens stanza injection point. The lens
// STANCE shapes WHICH claims/assumptions the structure rests on, and NAMES the candidate (thesis
// label = the candidate name, e.g. "BUILD OWN BACKEND NOW").
const DESIGN_SYSTEM = (lens: DesignLens, stanza: string) => `You are Keystone's generative decision designer. Synthesize ONE candidate decision Structure for the
founder's GOAL, under the ${lens.toUpperCase()} strategy lens, as a dependency graph matching this JSON
shape EXACTLY and return ONLY that JSON object (no prose):
{
  "thesisId": "<id of the SINGLE thesis node>",
  "nodes": [
    { "id": "snake_case_id", "type": "thesis" | "claim" | "assumption",
      "label": "<= 8 words", "confidence": 0.0-1.0,
      "groups": [ { "kind": "AND" | "OR", "childIds": ["<other node ids>"] } ],
      "evidence": { "source": "<file path / url / notes>", "fact": "<the cited fact>" } | null }
  ]
}

HARD RULES:
- EXACTLY ONE node of type "thesis", and "thesisId" MUST equal that node's id.
- Between 5 and 12 nodes total. All ids are snake_case and unique.
- The thesis depends (via groups) on claims; claims depend on assumptions. Leaf assumptions have "groups": [].
- Use AND groups when every child must hold; OR groups when any one child suffices (redundancy).
- confidence is each node's standalone solidity in [0,1]. Set it LOWER for assumptions the pack's facts
  stress, HIGHER where facts support them.
- The thesis label MUST be the CANDIDATE NAME: a short imperative naming this specific plan.
- Ground assumptions in the supplied context pack — make them company-specific, not generic.

STRATEGY LENS — ${lens.toUpperCase()}:
${stanza}`;

const LENSES: { lens: DesignLens; stanza: string }[] = [
  {
    lens: "aggressive",
    stanza:
      "Bet on SPEED and UPSIDE. Propose the boldest, most ambitious version that captures the goal fastest, and rest the Structure on optimistic EXECUTION and CAPACITY assumptions plus first-mover advantage. Name the thesis as a bold imperative (e.g. 'BUILD OWN BACKEND NOW').",
  },
  {
    lens: "conservative",
    stanza:
      "DE-RISK first. Prefer keeping proven / managed dependencies and hardening incrementally; rest the Structure on low-risk, already-true assumptions and redundancy. Name the thesis as a cautious stance (e.g. 'HARDEN MANAGED INFRA FIRST').",
  },
  {
    lens: "hybrid",
    stanza:
      "STAGE the bet. Pilot behind existing infrastructure and expand only if staged milestones prove out; rest the Structure on staged-milestone assumptions. Name the thesis as a staged plan (e.g. 'STAGE A ROLLOUT').",
  },
];

/** One live lens extraction: throws on any network/parse/schema/validate failure (retryOnce retries). */
async function extractLensRun(
  lens: DesignLens,
  stanza: string,
  goal: string,
  constraints: string,
  pack: unknown,
): Promise<Graph> {
  const client = new Anthropic({ maxRetries: 0 });
  const packSummary = renderPack(pack);
  const user = [
    `GOAL:\n${goal}`,
    constraints ? `CONSTRAINTS:\n${constraints}` : "",
    packSummary ? `CONTEXT PACK:\n${packSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await client.messages.create(
    { model: MODEL, max_tokens: MAX_TOKENS, system: DESIGN_SYSTEM(lens, stanza), messages: [{ role: "user", content: user }] },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  const parsed = GraphSchema.safeParse(extractJson(collectText(res.content)));
  if (!parsed.success) throw new Error("graph failed schema");
  const validated = validateGraph(parsed.data);
  if (!validated) throw new Error("graph failed validation wall");
  return validated;
}

/** The candidate NAME = the thesis node's label (uppercased); falls back to the lens name. */
function labelFor(graph: Graph, lens: DesignLens): string {
  const thesis = graph.nodes.find((n) => n.id === graph.thesisId);
  const label = (thesis?.label ?? "").trim();
  return label ? label.toUpperCase() : `${lens.toUpperCase()} PLAN`;
}

/**
 * Synthesize three rival candidates. NEVER throws, NEVER returns fewer than 3.
 * scenario/no-key → the pinned candidates (all "fixture"). Live → 3 lens extractions in parallel,
 * each with per-candidate attacks; any lens that fails live falls back to its pinned stand-in.
 */
export async function designCandidates(
  goal: string,
  constraints: string,
  pack?: unknown,
  scenario?: ScenarioId,
): Promise<DesignResult> {
  // The pinned stand-ins (index i ⇄ LENSES[i], i.e. aggressive/conservative/hybrid).
  const pinned = fixtureDesignCandidatesR();
  const standIn = (i: number): DesignCandidate => ({ ...pinned[i], source: "fixture" });

  // FIXTURES ALWAYS WIN when a scenario is pinned; live fires only with a key and no scenario.
  if (scenario) return { candidates: pinned.map((_, i) => standIn(i)), source: "fixture" };
  if (!hasApiKey()) return { candidates: pinned.map((_, i) => standIn(i)), source: "fixture" };

  const candidates = await Promise.all(
    LENSES.map(async ({ lens, stanza }, i): Promise<DesignCandidate> => {
      try {
        const graph = await retryOnce(() => extractLensRun(lens, stanza, goal, constraints, pack));
        // Same attack path + same pack as the main flow → comparable severities/reweight.
        const { attacks } = await generateAttacksWithSource(graph, pack);
        if (!attacks || attacks.length === 0) return standIn(i);
        return { lens, label: labelFor(graph, lens), graph, attacks, source: "live" };
      } catch {
        return standIn(i);
      }
    }),
  );

  const source: Source = candidates.every((c) => c.source === "live") ? "live" : "fixture";
  return { candidates, source };
}
