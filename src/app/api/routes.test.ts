import { describe, it, expect, beforeEach } from "vitest";
import { POST as extractPOST } from "./extract/route";
import { POST as attacksPOST } from "./attacks/route";
import { fixtureGraph } from "@/llm/fixture";
import { GraphSchema, AttacksSchema } from "@/llm/schemas";
import {
  fixtureContextGraphB,
  fixtureDecisionContextPack,
  fixtureDecisionContextPackB,
} from "@/context";
import type { Graph } from "@/engine";
import type { Attack } from "@/engine";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/extract", () => {
  it("returns a schema-valid graph", async () => {
    const res = await extractPOST(jsonReq("http://x/api/extract", { decision: "migrate" }));
    const data = await res.json();
    expect(() => GraphSchema.parse(data)).not.toThrow();
  });
});

describe("POST /api/attacks", () => {
  it("returns schema-valid attacks", async () => {
    const res = await attacksPOST(jsonReq("http://x/api/attacks", { graph: fixtureGraph() }));
    const data = await res.json();
    expect(() => AttacksSchema.parse(data)).not.toThrow();
  });
});

// ── W2-3 · scenario routing through the fixture chain ─────────────────────
describe("scenario selection routes the fixture chain (W2-3)", () => {
  it("extract with pack + no scenario returns the 9-node k_credible hero (T6 default)", async () => {
    const res = await extractPOST(
      jsonReq("http://x/api/extract", {
        decision: "migrate",
        pack: fixtureDecisionContextPack(),
      }),
    );
    const graph = (await res.json()) as Graph;
    expect(graph.nodes.length).toBe(9);
    expect(graph.nodes.some((n) => n.id === "k_credible")).toBe(true);
  });

  it("extract with pack + scenario 'B' returns the 7-node reinforce graph (k_sre)", async () => {
    const res = await extractPOST(
      jsonReq("http://x/api/extract", {
        decision: "reinforce",
        pack: fixtureDecisionContextPackB(),
        scenario: "B",
      }),
    );
    const graph = (await res.json()) as Graph;
    expect(graph).toEqual(fixtureContextGraphB());
    expect(graph.nodes.length).toBe(7);
    expect(graph.nodes.some((n) => n.id === "k_sre")).toBe(true);
  });

  it("attacks with pack + scenario 'B' returns the reinforce attack set", async () => {
    const res = await attacksPOST(
      jsonReq("http://x/api/attacks", {
        graph: fixtureContextGraphB(),
        pack: fixtureDecisionContextPackB(),
        scenario: "B",
      }),
    );
    const { attacks } = (await res.json()) as { attacks: Attack[] };
    expect(() => AttacksSchema.parse({ attacks })).not.toThrow();
    expect(attacks.some((a) => a.targetId === "k_sre")).toBe(true);
  });
});

// ── V3-4 · live-gating invariants at the route boundary ──────────────────
// A scenario short-circuits BEFORE the live branch, so even with a key present no live call fires
// (no SDK is constructed → no network) and the demo stays byte-deterministic. No key + no scenario
// also stays on the fixture. Neither ever 500s.
describe("live-gating invariants (V3-4)", () => {
  it("scenario + key still returns the fixture graph (FIXTURES ALWAYS WIN)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    try {
      const res = await extractPOST(
        jsonReq("http://x/api/extract", {
          decision: "migrate",
          pack: fixtureDecisionContextPack(),
          scenario: "A",
        }),
      );
      const graph = (await res.json()) as Graph;
      expect(graph.nodes.length).toBe(9);
      expect(graph.nodes.some((n) => n.id === "k_credible")).toBe(true);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("scenario 'B' + key still returns the reinforce attack fixture", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    try {
      const res = await attacksPOST(
        jsonReq("http://x/api/attacks", {
          graph: fixtureContextGraphB(),
          pack: fixtureDecisionContextPackB(),
          scenario: "B",
        }),
      );
      const { attacks } = (await res.json()) as { attacks: Attack[] };
      expect(attacks.some((a) => a.targetId === "k_sre")).toBe(true);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("no key + no scenario + pack returns the context fixture graph (never 500)", async () => {
    const res = await extractPOST(
      jsonReq("http://x/api/extract", {
        decision: "migrate",
        pack: fixtureDecisionContextPack(),
      }),
    );
    const graph = (await res.json()) as Graph;
    expect(graph.nodes.length).toBe(9);
    expect(graph.nodes.some((n) => n.id === "k_credible")).toBe(true);
  });
});
