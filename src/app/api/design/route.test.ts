import { describe, it, expect, beforeEach } from "vitest";
import { POST as designPOST } from "./route";
import { fixtureDesignCandidatesR, fixtureDecisionContextPackR } from "@/context";
import type { Attack, Graph } from "@/engine";

interface CandidateResp {
  lens: string;
  label: string;
  graph: Graph;
  attacks: Attack[];
  source: "live" | "fixture";
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/design", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/design", () => {
  it("scenario R → the pinned candidates + x-keystone-source: fixture", async () => {
    const res = await designPOST(
      jsonReq({ goal: "win enterprise collab revenue", scenario: "R", pack: fixtureDecisionContextPackR() }),
    );
    expect(res.headers.get("x-keystone-source")).toBe("fixture");
    const { candidates } = (await res.json()) as { candidates: CandidateResp[] };
    expect(candidates.length).toBe(3);
    expect(candidates.map((c) => c.lens)).toEqual(["aggressive", "conservative", "hybrid"]);
    expect(candidates.map((c) => c.label)).toEqual(fixtureDesignCandidatesR().map((c) => c.label));
    for (const c of candidates) expect(c.source).toBe("fixture");
  });

  it("no key + no scenario → still 3 pinned candidates (never fewer, never 500)", async () => {
    const res = await designPOST(jsonReq({ goal: "some custom goal", constraints: "small team" }));
    expect(res.headers.get("x-keystone-source")).toBe("fixture");
    const { candidates } = (await res.json()) as { candidates: CandidateResp[] };
    expect(candidates.length).toBe(3);
  });

  it("scenario R + key still returns the pinned fixtures (FIXTURES ALWAYS WIN)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    try {
      const res = await designPOST(jsonReq({ goal: "x", scenario: "R" }));
      expect(res.headers.get("x-keystone-source")).toBe("fixture");
      const { candidates } = (await res.json()) as { candidates: CandidateResp[] };
      expect(candidates.length).toBe(3);
      expect(candidates.every((c) => c.source === "fixture")).toBe(true);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("each candidate carries a valid graph + attacks targeting its assumptions", async () => {
    const res = await designPOST(jsonReq({ goal: "x", scenario: "R" }));
    const { candidates } = (await res.json()) as { candidates: CandidateResp[] };
    for (const c of candidates) {
      expect(c.graph.nodes.filter((n) => n.type === "thesis").length).toBe(1);
      const assumptions = new Set(c.graph.nodes.filter((n) => n.type === "assumption").map((n) => n.id));
      for (const a of c.attacks) expect(assumptions.has(a.targetId)).toBe(true);
    }
  });
});
