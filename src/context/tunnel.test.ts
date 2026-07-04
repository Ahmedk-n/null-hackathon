import { describe, it, expect } from "vitest";
import type { Graph } from "@/engine";
import { integrity } from "@/engine";
import {
  applyCounter,
  applyProposal,
  applyTunnelRound,
  initTunnelSession,
  scriptedDuelGraphR,
  scriptedDuelR,
  HOLD_THRESHOLD,
  SEVERITY_CAP,
  type Counter,
  type Proposal,
} from "./tunnel";

// Minimal graph: thesis AND(a). baseline integrity = a.confidence × 100 = 80. `c` is an
// unrelated claim kept only to exercise the "target is not an assumption" rule.
function g(): Graph {
  return {
    thesisId: "t",
    nodes: [
      { id: "t", type: "thesis", label: "T", confidence: 1, groups: [{ kind: "AND", childIds: ["a"] }] },
      { id: "a", type: "assumption", label: "A", confidence: 0.8, groups: [] },
      { id: "c", type: "claim", label: "C", confidence: 1, groups: [] },
    ],
  };
}

const prop = (p: Partial<Proposal> = {}): Proposal => ({
  targetId: "a",
  category: "execution",
  severity: 0.3,
  rationale: "x",
  ...p,
});
const ctr = (c: Partial<Counter> = {}): Counter => ({
  kind: "restore",
  targetId: "a",
  value: 0.8,
  citation: "notes: evidence",
  ...c,
});

describe("tunnel referee — PROSECUTOR proposal validation table", () => {
  it("accepts a well-formed attack on an assumption and knocks its confidence down", () => {
    const s = initTunnelSession(g());
    const { verdict, session } = applyProposal(s, prop({ severity: 0.5 }));
    expect(verdict.valid).toBe(true);
    expect(verdict.effectiveSeverity).toBe(0.5);
    // a: 0.8 → 0.8×(1−0.5)=0.4 → integrity 40.
    expect(verdict.integrityAfter).toBeCloseTo(40, 5);
    expect(session.attacked).toEqual(["a"]);
  });

  it("clamps severity into [0, SEVERITY_CAP]", () => {
    const s = initTunnelSession(g());
    const { verdict } = applyProposal(s, prop({ severity: 0.99 }));
    expect(verdict.effectiveSeverity).toBe(SEVERITY_CAP);
  });

  it("rejects an unknown target (NO-OP)", () => {
    const s = initTunnelSession(g());
    const { verdict, session } = applyProposal(s, prop({ targetId: "zzz" }));
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("unknown target");
    expect(verdict.delta).toBe(0);
    expect(session).toBe(s); // unchanged session
  });

  it("rejects a target that is not an assumption (thesis / claim)", () => {
    const s = initTunnelSession(g());
    expect(applyProposal(s, prop({ targetId: "t" })).verdict.reason).toBe("target is not an assumption");
    expect(applyProposal(s, prop({ targetId: "c" })).verdict.reason).toBe("target is not an assumption");
  });

  it("rejects an uncategorisable attack category", () => {
    const s = initTunnelSession(g());
    const { verdict } = applyProposal(s, prop({ category: "banana" }));
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("uncategorisable attack");
  });

  it("rejects a duplicate target within the session", () => {
    const s0 = initTunnelSession(g());
    const s1 = applyProposal(s0, prop()).session;
    const { verdict } = applyProposal(s1, prop());
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("duplicate target this session");
  });
});

describe("tunnel referee — ADVOCATE counter validation table", () => {
  it("accepts a restore ≤ baseline confidence and raises the node", () => {
    const s0 = initTunnelSession(g());
    const s1 = applyProposal(s0, prop({ severity: 0.5 })).session; // a → 0.4
    const { verdict, session } = applyCounter(s1, ctr({ value: 0.8 }));
    expect(verdict.valid).toBe(true);
    expect(verdict.integrityAfter).toBeCloseTo(80, 5);
    expect(session.graph.nodes.find((n) => n.id === "a")!.confidence).toBeCloseTo(0.8, 5);
  });

  it("rejects a restore above baseline confidence", () => {
    const s0 = initTunnelSession(g());
    const s1 = applyProposal(s0, prop({ severity: 0.5 })).session;
    const { verdict } = applyCounter(s1, ctr({ value: 0.95 }));
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("restore exceeds baseline confidence");
  });

  it("rejects a restore with an unknown / missing target", () => {
    const s = initTunnelSession(g());
    expect(applyCounter(s, ctr({ targetId: "zzz" })).verdict.reason).toBe("unknown restore target");
    expect(applyCounter(s, ctr({ targetId: undefined })).verdict.reason).toBe("unknown restore target");
  });

  it("rejects a restore with an empty citation", () => {
    const s0 = initTunnelSession(g());
    const s1 = applyProposal(s0, prop()).session;
    expect(applyCounter(s1, ctr({ citation: "   " })).verdict.reason).toBe("citation required");
  });

  it("accepts a rebuttal that cuts ≥ 0.5× the attack severity", () => {
    const s0 = initTunnelSession(g());
    const s1 = applyProposal(s0, prop({ severity: 0.4 })).session; // a → 0.48
    const { verdict, session } = applyCounter(s1, ctr({ kind: "rebuttal", value: 0.3 }));
    expect(verdict.valid).toBe(true);
    // newEff = 0.4 − 0.3 = 0.1 → a = 0.8×0.9 = 0.72 → integrity 72.
    expect(session.graph.nodes.find((n) => n.id === "a")!.confidence).toBeCloseTo(0.72, 5);
  });

  it("rejects a rebuttal below the 0.5× floor (NO-OP; attack stands)", () => {
    const s0 = initTunnelSession(g());
    const s1 = applyProposal(s0, prop({ severity: 0.4 })).session;
    const { verdict, session } = applyCounter(s1, ctr({ kind: "rebuttal", value: 0.1 }));
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("rebuttal too weak");
    expect(session).toBe(s1);
  });

  it("rejects a rebuttal when there is no attack to rebut", () => {
    const s = initTunnelSession(g());
    expect(applyCounter(s, ctr({ kind: "rebuttal", value: 0.5 })).verdict.reason).toBe("no attack to rebut");
  });

  it("rejects a rebuttal with an empty citation", () => {
    const s0 = initTunnelSession(g());
    const s1 = applyProposal(s0, prop({ severity: 0.4 })).session;
    expect(applyCounter(s1, ctr({ kind: "rebuttal", value: 0.3, citation: "" })).verdict.reason).toBe(
      "citation required",
    );
  });

  it("does not mutate the input session (purity)", () => {
    const s = initTunnelSession(g());
    const before = integrity(s.graph);
    applyProposal(s, prop({ severity: 0.5 }));
    expect(integrity(s.graph)).toBe(before);
  });
});

describe("tunnel referee — scripted scenario-R duel end-state (pinned)", () => {
  it("ends STANDS with exactly 3 HOLDS / 2 CRACKS at ≈37.9% integrity", () => {
    let s = initTunnelSession(scriptedDuelGraphR());
    expect(integrity(s.graph)).toBeCloseTo(52.63, 1); // baseline

    const perRound: { holds: boolean; final: number }[] = [];
    for (const round of scriptedDuelR()) {
      const res = applyTunnelRound(s, round);
      // Every prosecutor proposal is a valid, distinct attack.
      expect(res.proposal.valid).toBe(true);
      perRound.push({ holds: res.holds, final: res.integrity });
      s = res.session;
    }

    // Round 2's advocate rebuttal is intentionally below the floor → REJECTED.
    // (Verified structurally: 2 of 5 rounds crack.)
    const holds = perRound.filter((r) => r.holds).length;
    const cracks = perRound.filter((r) => !r.holds).length;
    expect(holds).toBe(3);
    expect(cracks).toBe(2);

    const finalInt = integrity(s.graph);
    expect(finalInt).toBeCloseTo(37.9, 1);
    expect(finalInt >= HOLD_THRESHOLD).toBe(true); // STANDS
  });

  it("all 5 prosecutor targets are distinct assumptions of the R graph", () => {
    const graph = scriptedDuelGraphR();
    const assumptions = new Set(graph.nodes.filter((n) => n.type === "assumption").map((n) => n.id));
    const targets = scriptedDuelR().map((r) => r.proposal.targetId);
    expect(new Set(targets).size).toBe(5);
    for (const t of targets) expect(assumptions.has(t)).toBe(true);
  });
});
