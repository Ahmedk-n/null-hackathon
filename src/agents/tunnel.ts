// V6-2 · ADVERSARIAL WIND TUNNEL — the live duel driver (server-only; never imported by a client).
//
// runTunnel streams a PROSECUTOR ⟷ ADVOCATE duel over ONE structure, refereed EVERY round by the
// pure solver (src/context/tunnel). Two lightweight agents run through the forced-tool-call transport
// (Wave B: structuredCall with `emit_proposal` / `emit_counter` + their zod schemas, validated on
// return), replacing the old free-text JSON scraping; the transcript is threaded into each prompt so
// the argument escalates. Agents only PROPOSE — applyProposal / applyCounter (pure) are the only
// things that move numbers.
//
// INVARIANTS (mirror the gather / design guardrails):
//  - NEVER throws. Scenario OR no key → the SCRIPTED 5-round fixture duel for scenario R.
//  - Any agent failure MID-DUEL → emit a "scripted continuation" notice, then finish from the script.
//  - `ts` is supplied by the caller (`now`) — this module owns no wall-clock.
import { z } from "zod";

import type { DecisionContextPack } from "@/context";
import type { Graph } from "@/engine";
import { integrity } from "@/engine";
import { hasApiKey, structuredCall } from "@/llm/structured";
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

// Tool schemas for the two duel agents. Optional/defaulted fields preserve the old lenient parse
// (missing severity → 0.3, missing rationale/citation → ""), so a slightly-thin live reply still
// lands instead of aborting the duel; kind defaults to "restore" (matches the old coercion).
const ProposalSchema = z.object({
  targetId: z.string(),
  category: z.string(),
  severity: z.number().default(0.3),
  rationale: z.string().default(""),
});
const CounterSchema = z.object({
  kind: z.enum(["restore", "rebuttal"]).catch("restore"),
  targetId: z.string().optional(),
  value: z.number().default(0),
  citation: z.string().default(""),
});

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
  const user = [
    "STRUCTURE ASSUMPTIONS:",
    renderAssumptions(graph),
    attacked.length ? `ALREADY ATTACKED (do not reuse): ${attacked.join(", ")}` : "",
    renderPackFacts(pack),
    transcript.length ? `TRANSCRIPT SO FAR:\n${transcript.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = await structuredCall({
    system: PROSECUTOR_SYSTEM,
    user,
    schema: ProposalSchema,
    toolName: "emit_proposal",
    toolDescription: "Emit ONE novel, realistic attack on the weakest unattacked assumption.",
  });
  return {
    targetId: raw.targetId,
    category: raw.category,
    severity: raw.severity,
    rationale: raw.rationale,
  };
}

async function advocate(
  graph: Graph,
  pack: DecisionContextPack | undefined,
  proposal: Proposal,
  transcript: string[],
): Promise<Counter> {
  const user = [
    `PROSECUTOR ATTACKED: ${proposal.targetId} (${proposal.category}, severity ${proposal.severity}) — ${proposal.rationale}`,
    "STRUCTURE ASSUMPTIONS:",
    renderAssumptions(graph),
    renderPackFacts(pack),
    transcript.length ? `TRANSCRIPT SO FAR:\n${transcript.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = await structuredCall({
    system: ADVOCATE_SYSTEM,
    user,
    schema: CounterSchema,
    toolName: "emit_counter",
    toolDescription: "Emit the advocate's counter (restore or rebuttal) to the latest attack.",
  });
  return {
    kind: raw.kind,
    targetId: raw.targetId ?? proposal.targetId,
    value: raw.value,
    citation: raw.citation,
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
