// V6-2 · ADVERSARIAL WIND TUNNEL — the PURE referee (no LLM / react / next / clock).
//
// Two agents duel over ONE structure; this module is the solver that referees every round and
// CANNOT be overridden. A PROSECUTOR proposes a novel attack; an ADVOCATE counters with a cited
// reinforcement or a severity rebuttal. The referee VALIDATES each move against a fixed table and
// only then lets the pure engine move the numbers — an invalid move is a NO-OP, flagged.
//
// This module is engine-adjacent and deliberately owns NO wall-clock: every function is a pure
// transform (identical inputs → identical outputs). The `ts` on TunnelEvent is stamped by the ROUTE
// only. It lives under src/context (not src/engine) because it composes engine primitives with the
// context weight-category normaliser — the same one-directional boundary as weights.ts.
import type { Graph } from "@/engine";
import { integrity, cloneGraph, clamp01, FAILURE_THRESHOLD } from "@/engine";
import { fixtureContextGraphR } from "./fixtures";
import { normaliseCategory } from "./weights";

// Referee constants.
export const SEVERITY_CAP = 0.6; // prosecutor severity is clamped into [0, SEVERITY_CAP]
export const REBUTTAL_MIN_FACTOR = 0.5; // a rebuttal must cut ≥ 0.5× the attack's effective severity
export const HOLD_THRESHOLD = FAILURE_THRESHOLD * 100; // structure "holds" a round at integrity ≥ 35

/** A PROSECUTOR move: one novel attack on a single assumption. */
export interface Proposal {
  targetId: string;
  category: string;
  severity: number;
  rationale: string;
}

/** An ADVOCATE move: restore a node's confidence (≤ baseline) or rebut the last attack's severity. */
export interface Counter {
  kind: "restore" | "rebuttal";
  /** Required for `restore` (the node to reinforce). Ignored for `rebuttal` (targets the last attack). */
  targetId?: string;
  /** restore → the confidence to restore to; rebuttal → how much of the attack severity to cut. */
  value: number;
  citation: string;
}

export interface TunnelRound {
  proposal: Proposal;
  counter: Counter;
}

/** The referee's ruling on ONE move. Invalid moves are NO-OPs (delta 0), with a reason. */
export interface StepVerdict {
  valid: boolean;
  reason: string | null;
  integrityBefore: number;
  integrityAfter: number;
  delta: number;
  /** Proposal only: the clamped severity actually applied (undefined for invalid / counters). */
  effectiveSeverity?: number;
}

/** Threaded session state. Pure — every transform returns a NEW session, never mutates the input. */
export interface TunnelSession {
  /** The live session graph (a clone; the MAIN store graph is never touched). */
  graph: Graph;
  /** Node id → original confidence (the restore ceiling). */
  baseline: Record<string, number>;
  /** Proposal targets used this session (duplicate rejection). */
  attacked: string[];
  /** The last VALID attack — a rebuttal rebuts this. */
  lastAttack: { targetId: string; preConfidence: number; effectiveSeverity: number } | null;
}

/** Snapshot a graph into a fresh tunnel session (baseline confidences captured for the restore wall). */
export function initTunnelSession(graph: Graph): TunnelSession {
  const g = cloneGraph(graph);
  const baseline: Record<string, number> = {};
  for (const n of g.nodes) baseline[n.id] = n.confidence;
  return { graph: g, baseline, attacked: [], lastAttack: null };
}

/**
 * Referee a PROSECUTOR proposal. Validation table (first failing rule wins):
 *   1. target must exist in the session graph            → "unknown target"
 *   2. target must be an assumption (leaf belief)        → "target is not an assumption"
 *   3. category must normalise to a weight category      → "uncategorisable attack"
 *   4. target must not have been attacked before         → "duplicate target this session"
 * A valid attack clamps severity into [0, SEVERITY_CAP] and knocks the node's confidence down.
 */
export function applyProposal(
  session: TunnelSession,
  proposal: Proposal,
): { session: TunnelSession; verdict: StepVerdict } {
  const before = integrity(session.graph);
  const graph = cloneGraph(session.graph);
  const node = graph.nodes.find((n) => n.id === proposal.targetId);

  let reason: string | null = null;
  if (!node) reason = "unknown target";
  else if (node.type !== "assumption") reason = "target is not an assumption";
  else if (normaliseCategory(proposal.category) === null) reason = "uncategorisable attack";
  else if (session.attacked.includes(proposal.targetId)) reason = "duplicate target this session";

  if (reason !== null || !node) {
    return {
      session,
      verdict: { valid: false, reason, integrityBefore: before, integrityAfter: before, delta: 0 },
    };
  }

  const effectiveSeverity = Math.min(SEVERITY_CAP, Math.max(0, proposal.severity));
  const pre = node.confidence;
  node.confidence = clamp01(pre * (1 - effectiveSeverity));
  const after = integrity(graph);
  return {
    session: {
      graph,
      baseline: session.baseline,
      attacked: [...session.attacked, proposal.targetId],
      lastAttack: { targetId: proposal.targetId, preConfidence: pre, effectiveSeverity },
    },
    verdict: {
      valid: true,
      reason: null,
      integrityBefore: before,
      integrityAfter: after,
      delta: after - before,
      effectiveSeverity,
    },
  };
}

/**
 * Referee an ADVOCATE counter. Validation table:
 *   restore  → targetId must exist; citation non-empty; value ≤ that node's baseline confidence.
 *   rebuttal → citation non-empty; there must be a last attack; value ≥ 0.5× its effective severity.
 * A valid restore sets the node's confidence to `value`. A valid rebuttal cuts the last attack's
 * effective severity by `value` (capped at the full severity) and recomputes the node from its
 * pre-attack confidence. Invalid → NO-OP, flagged (the attack stands).
 */
export function applyCounter(
  session: TunnelSession,
  counter: Counter,
): { session: TunnelSession; verdict: StepVerdict } {
  const before = integrity(session.graph);
  const graph = cloneGraph(session.graph);
  let lastAttack = session.lastAttack;
  const citationOk = typeof counter.citation === "string" && counter.citation.trim().length > 0;

  let reason: string | null = null;
  if (counter.kind === "restore") {
    const t = counter.targetId ? graph.nodes.find((n) => n.id === counter.targetId) : undefined;
    if (!counter.targetId || !t) reason = "unknown restore target";
    else if (!citationOk) reason = "citation required";
    else if (counter.value > (session.baseline[counter.targetId] ?? 0))
      reason = "restore exceeds baseline confidence";
    else t.confidence = clamp01(counter.value);
  } else {
    if (!citationOk) reason = "citation required";
    else if (!lastAttack) reason = "no attack to rebut";
    else if (counter.value < REBUTTAL_MIN_FACTOR * lastAttack.effectiveSeverity)
      reason = "rebuttal too weak";
    else {
      const reduction = Math.min(counter.value, lastAttack.effectiveSeverity);
      const newEff = Math.max(0, lastAttack.effectiveSeverity - reduction);
      const tn = graph.nodes.find((n) => n.id === lastAttack!.targetId);
      if (tn) tn.confidence = clamp01(lastAttack.preConfidence * (1 - newEff));
      lastAttack = { ...lastAttack, effectiveSeverity: newEff };
    }
  }

  if (reason !== null) {
    return {
      session,
      verdict: { valid: false, reason, integrityBefore: before, integrityAfter: before, delta: 0 },
    };
  }

  const after = integrity(graph);
  return {
    session: { graph, baseline: session.baseline, attacked: session.attacked, lastAttack },
    verdict: { valid: true, reason: null, integrityBefore: before, integrityAfter: after, delta: after - before },
  };
}

/**
 * Referee a whole round: proposal (attack) then counter (defence). Returns both rulings, the new
 * session, the final session integrity, and whether the structure HELD the round (integrity ≥ 35).
 */
export function applyTunnelRound(
  session: TunnelSession,
  round: TunnelRound,
): {
  session: TunnelSession;
  proposal: StepVerdict;
  counter: StepVerdict;
  integrity: number;
  holds: boolean;
} {
  const p = applyProposal(session, round.proposal);
  const c = applyCounter(p.session, round.counter);
  const finalInt = c.verdict.integrityAfter;
  return {
    session: c.session,
    proposal: p.verdict,
    counter: c.verdict,
    integrity: finalInt,
    holds: finalInt >= HOLD_THRESHOLD,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCRIPTED DUEL — scenario R (authored, deterministic; ends STANDS 3/2).
 * ──────────────────────────────────────────────────────────────────────────
 * Five rounds refereed against fixtureContextGraphR() (baseline integrity ≈52.6%). The two CRACK
 * rounds are engineered honestly: R2's advocate rebuttal is BELOW the 0.5× floor → the referee
 * REJECTS it (NO-OP) and the attack stands (int ≈21%); R3 attacks-then-restores reliability but the
 * R2 conversion damage still drags the round below 35. R4 repairs conversion and R5 restores audit,
 * ending ≈37.9% → STANDS. Verified numerically by src/context/tunnel.test.ts.
 *   R1 attack capacity  → restore capacity        HOLD  ≈47.4
 *   R2 attack conversion→ rebuttal REJECTED (weak) CRACK ≈21.3
 *   R3 attack reliability→restore reliability      CRACK ≈21.3  (conversion still down)
 *   R4 attack e2e        → restore conversion      HOLD  ≈37.9
 *   R5 attack audit      → restore audit           HOLD  ≈37.9  → STANDS (3 HOLDS / 2 CRACKS)
 * ════════════════════════════════════════════════════════════════════════ */
export function scriptedDuelR(): TunnelRound[] {
  return [
    {
      proposal: {
        targetId: "team_has_backend_capacity",
        category: "execution risk",
        severity: 0.5,
        rationale:
          "A 6-person team with no backend history has no spare capacity to build and operate own infra before the roadmap meeting.",
      },
      counter: {
        kind: "restore",
        targetId: "team_has_backend_capacity",
        value: 0.72,
        citation:
          "notes: two backend engineers accepted offers this quarter, adding operate-and-build capacity.",
      },
    },
    {
      proposal: {
        targetId: "conversion_is_collab_limited",
        category: "market",
        severity: 0.55,
        rationale:
          "The growth bottleneck is free-to-paid conversion; there is no proof collaboration quality is what gates it.",
      },
      // Rebuttal is intentionally below the 0.5× floor (0.20 < 0.5×0.55=0.275) → referee REJECTS it.
      counter: {
        kind: "rebuttal",
        value: 0.2,
        citation: "notes: anecdotal churn survey mentions collaboration.",
      },
    },
    {
      proposal: {
        targetId: "reliability_observability_ready",
        category: "reliability",
        severity: 0.45,
        rationale:
          "Owning realtime infra raises the reliability burden while observability is only Sentry error tracking.",
      },
      counter: {
        kind: "restore",
        targetId: "reliability_observability_ready",
        value: 0.95,
        citation:
          "excalidraw-app/package.json: Firebase managed SLA plus Sentry paging backstops pilot reliability.",
      },
    },
    {
      proposal: {
        targetId: "can_reimplement_e2e_collab",
        category: "technical",
        severity: 0.2,
        rationale:
          "Reimplementing E2E-encrypted Socket.IO collaboration off excalidraw-room is real, unscoped work.",
      },
      // Repairs the round-2 conversion damage with fresh evidence.
      counter: {
        kind: "restore",
        targetId: "conversion_is_collab_limited",
        value: 0.9,
        citation:
          "https://www.g2.com/products/excalidraw/reviews: collaboration-active teams convert to Excalidraw+ at markedly higher rates.",
      },
    },
    {
      proposal: {
        targetId: "enterprise_auditability_wins",
        category: "auditability",
        severity: 0.3,
        rationale:
          "SOC 2 / DPA demands need audited controls and process, not merely owning the infrastructure.",
      },
      counter: {
        kind: "restore",
        targetId: "enterprise_auditability_wins",
        value: 0.9,
        citation:
          "https://www.g2.com/products/excalidraw/reviews: SOC 2 Type II compliant with a DPA already in place.",
      },
    },
  ];
}

/** The graph the scripted duel is refereed against (scenario R's structure). */
export function scriptedDuelGraphR(): Graph {
  return fixtureContextGraphR();
}

/* ── Streaming event shape (the ROUTE stamps `ts`; pure/client modules never do). ────────────── */
export type TunnelRole = "PROSECUTOR" | "SOLVER" | "ADVOCATE";
export type RoundVerdict = "HOLD" | "CRACK";

export type TunnelEvent =
  | { type: "round"; round: number; ts: string }
  | {
      type: "proposal";
      round: number;
      role: "PROSECUTOR";
      targetId: string;
      category: string;
      severity: number;
      rationale: string;
      ts: string;
    }
  | {
      type: "verdict";
      round: number;
      role: "SOLVER";
      step: "proposal" | "counter";
      valid: boolean;
      reason: string | null;
      integrity: number;
      delta: number;
      verdict?: RoundVerdict;
      ts: string;
    }
  | {
      type: "counter";
      round: number;
      role: "ADVOCATE";
      kind: "restore" | "rebuttal";
      targetId?: string;
      value: number;
      citation: string;
      ts: string;
    }
  | { type: "notice"; message: string; ts: string }
  | { type: "error"; message: string; ts: string }
  | { type: "done"; verdict: "STANDS" | "FALLS"; holds: number; cracks: number; source: "live" | "fixture"; ts: string };

/** The streaming callback the duel driver uses; the route wires it to the SSE stream. */
export type TunnelEmit = (e: TunnelEvent) => void;
/** Timestamp supplier — the route passes `() => new Date().toISOString()`. */
export type TunnelNow = () => string;
