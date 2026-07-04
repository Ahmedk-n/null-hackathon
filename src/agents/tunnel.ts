// V6-2 · ADVERSARIAL WIND TUNNEL — the live duel driver (server-only; never imported by a client).
//
// runTunnel streams a PROSECUTOR ⟷ ADVOCATE duel over ONE structure, refereed EVERY round by the
// pure solver (src/context/tunnel). Two lightweight agents run on the proven live pattern
// (messages.create + first-balanced-JSON + zod-free safe parse + 30s timeout + retryOnce, transcript
// threaded into each prompt so the argument escalates). Agents only PROPOSE — applyProposal /
// applyCounter (pure) are the only things that move numbers.
//
// INVARIANTS (mirror the gather / design guardrails):
//  - NEVER throws. Scenario OR no key → the SCRIPTED 5-round fixture duel for scenario R.
//  - Any agent failure MID-DUEL → emit a "scripted continuation" notice, then finish from the script.
//  - `ts` is supplied by the caller (`now`) — this module owns no wall-clock.
import Anthropic from "@anthropic-ai/sdk";

import type { DecisionContextPack } from "@/context";
import type { Graph } from "@/engine";
import { integrity } from "@/engine";
import {
  applyCounter,
  applyProposal,
  initTunnelSession,
  scriptedDuelGraphR,
  scriptedDuelR,
  HOLD_THRESHOLD,
  type Counter,
  type Proposal,
  type TunnelSession,
  type TunnelEmit,
  type TunnelNow,
} from "@/context/tunnel";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 1_500;
const REQUEST_TIMEOUT_MS = 30_000;

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

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

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

// ── Prompt rendering ─────────────────────────────────────────────────────────
function renderAssumptions(graph: Graph): string {
  return graph.nodes
    .filter((n) => n.type === "assumption")
    .map((n) => `- ${n.id} (conf ${n.confidence.toFixed(2)}): ${n.label}`)
    .join("\n");
}

function renderPackFacts(pack?: DecisionContextPack): string {
  if (!pack) return "";
  const facts = [
    ...pack.relevantBusinessFacts,
    ...pack.relevantTechnicalFacts,
    ...pack.relevantTemporalFacts,
  ];
  return facts.length ? `KNOWN FACTS (cite one as evidence):\n${facts.map((f) => `- ${f}`).join("\n")}` : "";
}

const PROSECUTOR_SYSTEM = `You are the PROSECUTOR in an adversarial wind tunnel. Find the SINGLE weakest still-unattacked
assumption in the structure and propose ONE novel, realistic attack on it. Return ONLY this JSON:
{ "targetId": "<an assumption id>", "category": "<execution|market|technical|competitor|opportunity_cost|timeline|reliability|auditability>",
  "severity": 0.0-0.6, "rationale": "<one sentence, concrete and specific>" }
Do not repeat a target already attacked. Escalate on the transcript.`;

const ADVOCATE_SYSTEM = `You are the ADVOCATE in an adversarial wind tunnel. Counter the prosecutor's latest attack with
EITHER a restore (reinforce the attacked assumption with evidence) OR a rebuttal (argue the attack's
severity is overstated). Return ONLY this JSON:
{ "kind": "restore" | "rebuttal", "targetId": "<assumption id, for restore>",
  "value": <restore: the confidence to restore to (≤ its original); rebuttal: how much severity to cut, ≥ half the attack>,
  "citation": "<a real fact/evidence source — never empty>" }`;

async function prosecute(
  graph: Graph,
  pack: DecisionContextPack | undefined,
  attacked: string[],
  transcript: string[],
): Promise<Proposal> {
  const client = new Anthropic({ maxRetries: 0 });
  const user = [
    "STRUCTURE ASSUMPTIONS:",
    renderAssumptions(graph),
    attacked.length ? `ALREADY ATTACKED (do not reuse): ${attacked.join(", ")}` : "",
    renderPackFacts(pack),
    transcript.length ? `TRANSCRIPT SO FAR:\n${transcript.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await client.messages.create(
    { model: MODEL, max_tokens: MAX_TOKENS, system: PROSECUTOR_SYSTEM, messages: [{ role: "user", content: user }] },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  const raw = extractJson(collectText(res.content)) as Record<string, unknown>;
  if (typeof raw.targetId !== "string" || typeof raw.category !== "string")
    throw new Error("prosecutor: malformed proposal");
  return {
    targetId: raw.targetId,
    category: raw.category,
    severity: typeof raw.severity === "number" ? raw.severity : 0.3,
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
  };
}

async function advocate(
  graph: Graph,
  pack: DecisionContextPack | undefined,
  proposal: Proposal,
  transcript: string[],
): Promise<Counter> {
  const client = new Anthropic({ maxRetries: 0 });
  const user = [
    `PROSECUTOR ATTACKED: ${proposal.targetId} (${proposal.category}, severity ${proposal.severity}) — ${proposal.rationale}`,
    "STRUCTURE ASSUMPTIONS:",
    renderAssumptions(graph),
    renderPackFacts(pack),
    transcript.length ? `TRANSCRIPT SO FAR:\n${transcript.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await client.messages.create(
    { model: MODEL, max_tokens: MAX_TOKENS, system: ADVOCATE_SYSTEM, messages: [{ role: "user", content: user }] },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  const raw = extractJson(collectText(res.content)) as Record<string, unknown>;
  const kind = raw.kind === "rebuttal" ? "rebuttal" : "restore";
  return {
    kind,
    targetId: typeof raw.targetId === "string" ? raw.targetId : proposal.targetId,
    value: typeof raw.value === "number" ? raw.value : 0,
    citation: typeof raw.citation === "string" ? raw.citation : "",
  };
}

// ── Emit helpers (keep the round cadence: round → proposal → verdict → counter → verdict). ─────
interface Tally {
  holds: number;
  cracks: number;
}

function emitRoundMoves(
  emit: TunnelEmit,
  now: TunnelNow,
  round: number,
  session: TunnelSession,
  proposal: Proposal,
  counter: Counter,
  tally: Tally,
): TunnelSession {
  emit({ type: "round", round, ts: now() });

  emit({
    type: "proposal",
    round,
    role: "PROSECUTOR",
    targetId: proposal.targetId,
    category: proposal.category,
    severity: proposal.severity,
    rationale: proposal.rationale,
    ts: now(),
  });
  const p = applyProposal(session, proposal);
  emit({
    type: "verdict",
    round,
    role: "SOLVER",
    step: "proposal",
    valid: p.verdict.valid,
    reason: p.verdict.reason,
    integrity: p.verdict.integrityAfter,
    delta: p.verdict.delta,
    ts: now(),
  });

  emit({
    type: "counter",
    round,
    role: "ADVOCATE",
    kind: counter.kind,
    targetId: counter.targetId,
    value: counter.value,
    citation: counter.citation,
    ts: now(),
  });
  const c = applyCounter(p.session, counter);
  const holds = c.verdict.integrityAfter >= HOLD_THRESHOLD;
  if (holds) tally.holds += 1;
  else tally.cracks += 1;
  emit({
    type: "verdict",
    round,
    role: "SOLVER",
    step: "counter",
    valid: c.verdict.valid,
    reason: c.verdict.reason,
    integrity: c.verdict.integrityAfter,
    delta: c.verdict.delta,
    verdict: holds ? "HOLD" : "CRACK",
    ts: now(),
  });
  return c.session;
}

/** Replay the scripted duel for scenario R (from `startRound`) against `session`, then finish. */
function runScriptedFrom(
  emit: TunnelEmit,
  now: TunnelNow,
  session: TunnelSession,
  startRound: number,
  tally: Tally,
): void {
  const rounds = scriptedDuelR();
  let s = session;
  for (let i = startRound; i < rounds.length; i++) {
    s = emitRoundMoves(emit, now, i + 1, s, rounds[i].proposal, rounds[i].counter, tally);
  }
  finish(emit, now, s, tally, "fixture");
}

function finish(emit: TunnelEmit, now: TunnelNow, session: TunnelSession, tally: Tally, source: "live" | "fixture"): void {
  const finalInt = integrity(session.graph);
  emit({
    type: "done",
    verdict: finalInt >= HOLD_THRESHOLD ? "STANDS" : "FALLS",
    holds: tally.holds,
    cracks: tally.cracks,
    source,
    ts: now(),
  });
}

/**
 * Stream a wind-tunnel duel. Scenario OR no key → the scripted fixture duel for scenario R. Live →
 * two agents per round; any agent failure mid-duel emits a scripted-continuation notice and finishes
 * from the script. NEVER throws.
 */
export async function runTunnel(
  graph: Graph,
  pack: DecisionContextPack | undefined,
  emit: TunnelEmit,
  now: TunnelNow,
  maxRounds = 5,
  scenario?: string,
): Promise<void> {
  const tally: Tally = { holds: 0, cracks: 0 };

  // Scripted path — deterministic, refereed against scenario R's structure.
  if (scenario || !hasApiKey()) {
    runScriptedFrom(emit, now, initTunnelSession(scriptedDuelGraphR()), 0, tally);
    return;
  }

  // Live path — the duel runs on a session clone of the passed structure.
  let session = initTunnelSession(graph);
  const transcript: string[] = [];
  try {
    for (let i = 0; i < maxRounds; i++) {
      const proposal = await prosecute(session.graph, pack, session.attacked, transcript);
      const counter = await advocate(session.graph, pack, proposal, transcript);
      transcript.push(
        `R${i + 1} PROSECUTOR ${proposal.targetId} (${proposal.category} ${proposal.severity}) — ${proposal.rationale}`,
        `R${i + 1} ADVOCATE ${counter.kind} ${counter.value} — ${counter.citation}`,
      );
      session = emitRoundMoves(emit, now, i + 1, session, proposal, counter, tally);
    }
    finish(emit, now, session, tally, "live");
  } catch {
    // Mid-duel agent failure → note it, then finish from the script (never a 500, never a dead duel).
    emit({ type: "notice", message: "AGENT UNAVAILABLE — SCRIPTED CONTINUATION", ts: now() });
    // Continue from the round we failed on, using the scripted duel indices from here.
    const completedRounds = Math.min(tally.holds + tally.cracks, scriptedDuelR().length);
    runScriptedFrom(emit, now, session, completedRounds, tally);
  }
}
