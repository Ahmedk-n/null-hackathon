import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentEvent, GatherKind, GatherSource } from "./types";
import type { GatherFindings } from "./types";

// vi.hoisted so the mock factories can reference the spies (vi.mock is hoisted above imports).
// Mocking the structuredCall SEAM (not the SDK) lets us drive the MCP branch of each agent
// deterministically — no key/network needed — while leaving the offline (no-key) fixture
// path in the same file completely unaffected (it never reaches structuredCall). The business
// agent's PHASE 1 (web research) goes through the raw Anthropic client rather than
// structuredCall, so its create/beta.create are ALSO stubbed here — otherwise a real
// (fake-keyed) network call would fire and either hang or fail with an auth error.
const { structuredCallMock, anthropicCreateMock, anthropicBetaCreateMock } = vi.hoisted(() => ({
  structuredCallMock: vi.fn(),
  anthropicCreateMock: vi.fn(),
  anthropicBetaCreateMock: vi.fn(),
}));
vi.mock("@/llm/structured", async () => {
  const actual = await vi.importActual<typeof import("@/llm/structured")>("@/llm/structured");
  return { ...actual, structuredCall: structuredCallMock };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreateMock };
    beta = { messages: { create: anthropicBetaCreateMock } };
  },
}));

import { gather } from "./index";
import { GatherFindingsSchema } from "./schemas";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  structuredCallMock.mockReset();
});

const CASES: { kind: GatherKind; source: GatherSource }[] = [
  { kind: "technical", source: {} },
  { kind: "business", source: {} },
  { kind: "temporal", source: { notes: "" } },
];

const FIXED_TS = "2026-07-03T00:00:00Z";

describe("gather (offline: fixture fallback)", () => {
  for (const { kind, source } of CASES) {
    it(`${kind}: resolves schema-valid findings, emits status + terminal done, never throws`, async () => {
      const events: AgentEvent[] = [];
      const findings = await gather(kind, source, (e) => events.push(e), () => FIXED_TS);

      expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
      expect(findings.kind).toBe(kind);

      expect(events.some((e) => e.type === "status")).toBe(true);

      const last = events[events.length - 1];
      expect(last.type).toBe("done");
      if (last.type === "done") {
        expect(last.source).toBe("fixture");
        expect(() => GatherFindingsSchema.parse(last.findings)).not.toThrow();
      }

      // Every event's ts is stamped by the supplied clock.
      expect(events.every((e) => e.ts === FIXED_TS)).toBe(true);
    });

    it(`${kind}: no key + no connections (mcpServers omitted) → still the unchanged fixture path`, async () => {
      const events: AgentEvent[] = [];
      const findings = await gather(kind, source, (e) => events.push(e), () => FIXED_TS, undefined);
      expect(findings.kind).toBe(kind);
      const last = events[events.length - 1];
      expect(last.type).toBe("done");
      if (last.type === "done") expect(last.source).toBe("fixture");
      expect(structuredCallMock).not.toHaveBeenCalled();
    });
  }
});

const STUB_MCP_SERVERS = [
  { type: "url" as const, name: "github", url: "https://api.githubcopilot.com/mcp/", authorization_token: "ghp_x" },
];

function stubLiveFindings(kind: GatherKind): GatherFindings {
  const facts = Array.from({ length: 5 }, (_, i) => ({
    label: `Fact ${i}`,
    value: `Value ${i}`,
    source: kind === "technical" ? `src/file${i}.ts` : kind === "business" ? `https://example.com/${i}` : "notes",
  }));
  return { kind, summary: `${kind} summary via MCP`, facts };
}

describe("gather (with a key + a stub mcpServers): the MCP branch is taken", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    anthropicCreateMock.mockReset();
    anthropicBetaCreateMock.mockReset();
    // Business's phase-1 (web research) response — phase-2 (structuredCall, mocked above)
    // is what actually produces the findings the test asserts on.
    const researchReply = { content: [{ type: "text", text: "Research synthesis with sources." }] };
    anthropicCreateMock.mockResolvedValue(researchReply);
    anthropicBetaCreateMock.mockResolvedValue(researchReply);
  });

  it("technical: two-phase MCP flow — exploreWithTools (phase 1, unforced) THEN the forced emit (phase 2) — live done, no clone attempted", async () => {
    structuredCallMock.mockResolvedValue(stubLiveFindings("technical"));
    const events: AgentEvent[] = [];
    const findings = await gather("technical", {}, (e) => events.push(e), () => FIXED_TS, STUB_MCP_SERVERS);

    // PHASE 1 — exploreWithTools calls the raw beta SDK directly (not structuredCall) with the
    // connected MCP servers attached and NO forced tool_choice, so the model can actually call
    // mcp_toolset tools instead of being pinned to an emit-only shape.
    expect(anthropicBetaCreateMock).toHaveBeenCalled();
    const researchReq = anthropicBetaCreateMock.mock.calls[0][0];
    expect(researchReq.mcp_servers).toEqual(STUB_MCP_SERVERS);
    expect(researchReq.tool_choice).toBeUndefined();

    // PHASE 2 — the forced emit runs AFTER phase 1, fed phase 1's research synthesis.
    expect(structuredCallMock).toHaveBeenCalledTimes(1);
    expect(structuredCallMock.mock.calls[0][0].user).toContain("Research synthesis with sources.");

    expect(findings.kind).toBe("technical");
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("live");
  });

  it("business: passes mcpServers through and emits a live done", async () => {
    structuredCallMock.mockResolvedValue(stubLiveFindings("business"));
    const events: AgentEvent[] = [];
    const findings = await gather(
      "business",
      { website: "https://acme.example.com" },
      (e) => events.push(e),
      () => FIXED_TS,
      STUB_MCP_SERVERS,
    );

    expect(structuredCallMock).toHaveBeenCalledTimes(1);
    expect(structuredCallMock.mock.calls[0][0]).toMatchObject({ mcpServers: STUB_MCP_SERVERS });
    expect(findings.kind).toBe("business");
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("live");
  });

  it("temporal: passes mcpServers through and emits a live done", async () => {
    structuredCallMock.mockResolvedValue(stubLiveFindings("temporal"));
    const events: AgentEvent[] = [];
    const findings = await gather(
      "temporal",
      { notes: "Call with Acme tomorrow." },
      (e) => events.push(e),
      () => FIXED_TS,
      STUB_MCP_SERVERS,
    );

    expect(structuredCallMock).toHaveBeenCalledTimes(1);
    expect(structuredCallMock.mock.calls[0][0]).toMatchObject({ mcpServers: STUB_MCP_SERVERS });
    expect(findings.kind).toBe("temporal");
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("live");
  });

  it("technical: MCP branch failing (thin reply) falls through to the fixture, never throws", async () => {
    structuredCallMock.mockResolvedValue({ kind: "technical", summary: "thin", facts: [] });
    const events: AgentEvent[] = [];
    const findings = await gather("technical", {}, (e) => events.push(e), () => FIXED_TS, STUB_MCP_SERVERS);
    expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("fixture");
  });
});
