// V3-5 · JUDGE-MODE full-chain integration (module-mocked SDK).
//
// This is the keystroke that used to kill the demo: a judge types a real decision (CUSTOM mode →
// no `scenario` field) and the /context → /extract → /attacks chain must run LIVE end-to-end when
// a key exists, yet degrade to the deterministic fixture — never 500 — the moment the model
// misbehaves. We drive the same `@anthropic-ai/sdk` mock that backs BOTH compile.ts (context) and
// client.ts (extract/attacks), so one stub covers the whole chain.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// vi.hoisted so the mock factory can reference the spy (vi.mock is hoisted above imports).
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

// Imported AFTER the mock is registered so every live path uses the stub SDK.
import { POST as contextPOST } from "./context/route";
import { POST as extractPOST } from "./extract/route";
import { POST as attacksPOST } from "./attacks/route";
import { validateGraph } from "@/llm/validate";
import {
  fixtureCompanyContext,
  fixtureDecisionContextPack,
  fixtureContextGraph,
  fixtureContextAttacks,
} from "@/context";
import type { Graph, Attack } from "@/engine";

// The model's reply shape the live paths parse: content[].text carrying the JSON object.
const msg = (obj: unknown) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
const garbage = { content: [{ type: "text", text: "sorry — no json here" }] };

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// A schema-valid, tagged live context payload — LIVE-STAGE proves it came from the model.
function liveContextMsg() {
  const companyContext = fixtureCompanyContext();
  companyContext.business.companyStage = "LIVE-STAGE";
  const decisionContextPack = fixtureDecisionContextPack("Should we hire a VP of Sales?");
  return msg({ companyContext, decisionContextPack });
}

// A 5-node graph that PASSES the validation wall and is provably NOT the offline fixture.
const LIVE_GRAPH = {
  thesisId: "t_hire",
  nodes: [
    { id: "t_hire", type: "thesis", label: "Hire a VP of Sales", confidence: 1, groups: [{ kind: "AND", childIds: ["c_pipe", "c_ready"] }] },
    { id: "c_pipe", type: "claim", label: "Pipeline supports a hire", confidence: 1, groups: [{ kind: "AND", childIds: ["a_demand"] }] },
    { id: "c_ready", type: "claim", label: "Org is ready to onboard", confidence: 1, groups: [{ kind: "AND", childIds: ["a_process"] }] },
    { id: "a_demand", type: "assumption", label: "Inbound demand is steady", confidence: 0.7, groups: [] },
    { id: "a_process", type: "assumption", label: "Sales process is documented", confidence: 0.6, groups: [] },
  ],
};

const LIVE_ATTACKS = {
  attacks: [
    { id: "atk_demand", targetId: "a_demand", category: "market", severity: 0.4, rationale: "demand not yet validated" },
    { id: "atk_process", targetId: "a_process", category: "execution risk", severity: 0.3, rationale: "process is tribal knowledge" },
  ],
};

beforeEach(() => {
  createMock.mockReset();
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("CUSTOM mode + key + valid model replies → the whole chain runs LIVE", () => {
  it("context 200 live → extract passes the wall (live graph) → attacks 200 valid", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";

    // Stage 1 — context (no `scenario` field: CUSTOM mode).
    createMock.mockResolvedValueOnce(liveContextMsg());
    const ctxRes = await contextPOST(
      jsonReq("http://x/api/context", { decisionText: "Should we hire a VP of Sales?" }),
    );
    expect(ctxRes.status).toBe(200);
    const ctx = (await ctxRes.json()) as {
      companyContext: { business: { companyStage: string } };
      decisionContextPack: unknown;
      source: string;
    };
    expect(ctx.source).toBe("live");
    expect(ctx.companyContext.business.companyStage).toBe("LIVE-STAGE");

    // Stage 2 — extract (feed the live pack forward). A valid graph must pass validateGraph and
    // NOT be the offline k_credible fixture.
    createMock.mockResolvedValueOnce(msg(LIVE_GRAPH));
    const exRes = await extractPOST(
      jsonReq("http://x/api/extract", {
        decision: "Should we hire a VP of Sales?",
        pack: ctx.decisionContextPack,
      }),
    );
    expect(exRes.status).toBe(200);
    const graph = (await exRes.json()) as Graph;
    expect(graph.thesisId).toBe("t_hire");
    expect(validateGraph(graph)).not.toBeNull();
    expect(graph.nodes.some((n) => n.id === "k_credible")).toBe(false);

    // Stage 3 — attacks over the live graph.
    createMock.mockResolvedValueOnce(msg(LIVE_ATTACKS));
    const atkRes = await attacksPOST(
      jsonReq("http://x/api/attacks", { graph, pack: ctx.decisionContextPack }),
    );
    expect(atkRes.status).toBe(200);
    const { attacks } = (await atkRes.json()) as { attacks: Attack[] };
    expect(attacks.map((a) => a.targetId).sort()).toEqual(["a_demand", "a_process"]);
    expect(attacks.every((a) => a.severity <= 0.6)).toBe(true);
  });
});

describe("CUSTOM mode + key + MALFORMED replies → graceful fixture fallback, never 500", () => {
  it("all three stages return 200 on garbage JSON and land on the deterministic fixture", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    createMock.mockResolvedValue(garbage); // every call (incl. the retryOnce) is malformed

    const ctxRes = await contextPOST(
      jsonReq("http://x/api/context", { decisionText: "anything" }),
    );
    expect(ctxRes.status).toBe(200);
    expect(((await ctxRes.json()) as { source: string }).source).toBe("fixture");

    const exRes = await extractPOST(
      jsonReq("http://x/api/extract", { decision: "anything", pack: fixtureDecisionContextPack() }),
    );
    expect(exRes.status).toBe(200);
    expect(await exRes.json()).toEqual(fixtureContextGraph());

    const atkRes = await attacksPOST(
      jsonReq("http://x/api/attacks", {
        graph: fixtureContextGraph(),
        pack: fixtureDecisionContextPack(),
      }),
    );
    expect(atkRes.status).toBe(200);
    expect(((await atkRes.json()) as { attacks: Attack[] }).attacks).toEqual(fixtureContextAttacks());
  });
});

describe("INVARIANT — a passed scenario + key still wins the fixture (never goes live)", () => {
  it("scenario 'A' short-circuits every stage before the SDK is even constructed", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    createMock.mockResolvedValue(liveContextMsg()); // would be used IF a live call fired — it must not

    const ctxRes = await contextPOST(
      jsonReq("http://x/api/context", { decisionText: "migrate", scenario: "A" }),
    );
    expect(((await ctxRes.json()) as { source: string }).source).toBe("fixture");

    const exRes = await extractPOST(
      jsonReq("http://x/api/extract", {
        decision: "migrate",
        pack: fixtureDecisionContextPack(),
        scenario: "A",
      }),
    );
    const graph = (await exRes.json()) as Graph;
    expect(graph.nodes.some((n) => n.id === "k_credible")).toBe(true);

    // The scenario short-circuit precedes the live branch in every function → zero SDK calls.
    expect(createMock).not.toHaveBeenCalled();
  });
});
