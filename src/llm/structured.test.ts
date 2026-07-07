// Module-mocked SDK unit tests for the forced-tool-call transport (Wave A). The real
// @anthropic-ai/sdk is replaced with a stub whose messages.create we drive per-test, so we
// can prove structuredCall's contract WITHOUT a key or network:
//  - a forced tool_use response whose input matches the schema → the validated object,
//  - a schema-MISMATCHED tool input → throws (so callers' retryOnce + fixture fallback fire),
//  - no tool_use block in the reply → throws.
// Mirrors the vi.hoisted + vi.mock("@anthropic-ai/sdk") approach in src/llm/client.test.ts.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

// vi.hoisted so the mock factory can reference the spy (vi.mock is hoisted above imports).
const { createMock, createBetaMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  createBetaMock: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
    beta = { messages: { create: createBetaMock } };
  },
}));

// Imported AFTER the mock is registered so structuredCall uses the stub SDK.
import { structuredCall, hasApiKey, MODEL, MAX_TOKENS, exploreWithTools } from "./structured";

// A small non-trivial schema (nested object + array) to exercise zodToJsonSchema + validation.
const Schema = z.object({
  title: z.string(),
  count: z.number(),
  tags: z.array(z.string()),
});

const toolUse = (input: unknown) => ({
  content: [{ type: "tool_use", id: "toolu_1", name: "emit", input }],
});

const args = {
  system: "sys",
  user: "usr",
  schema: Schema,
  toolName: "emit",
  toolDescription: "emit the structured result",
};

beforeEach(() => {
  createMock.mockReset();
  createBetaMock.mockReset();
});

describe("MODEL / MAX_TOKENS constants", () => {
  it("model is exactly claude-opus-4-8", () => {
    expect(MODEL).toBe("claude-opus-4-8");
  });
  it("MAX_TOKENS is a positive number", () => {
    expect(MAX_TOKENS).toBeGreaterThan(0);
  });
});

describe("hasApiKey", () => {
  it("false without the env key, true with it", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(hasApiKey()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(hasApiKey()).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe("structuredCall (mocked SDK)", () => {
  it("forced tool_use with schema-valid input → returns the validated object", async () => {
    const payload = { title: "hello", count: 3, tags: ["a", "b"] };
    createMock.mockResolvedValue(toolUse(payload));
    const out = await structuredCall(args);
    expect(out).toEqual(payload);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("issues a FORCED tool call (tool_choice pins the tool) with the tool definition", async () => {
    createMock.mockResolvedValue(toolUse({ title: "x", count: 1, tags: [] }));
    await structuredCall(args);
    const req = createMock.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-4-8");
    expect(req.tool_choice).toEqual({ type: "tool", name: "emit" });
    expect(req.tools).toHaveLength(1);
    expect(req.tools[0].name).toBe("emit");
    // zodToJsonSchema produced an object JSON Schema for the tool input.
    expect(req.tools[0].input_schema.type).toBe("object");
    expect(req.tools[0].input_schema.properties).toHaveProperty("title");
  });

  it("schema-mismatched tool input → throws (callers' retry/fixture handles it)", async () => {
    // count is a string, tags missing → zod .parse rejects.
    createMock.mockResolvedValue(toolUse({ title: "hello", count: "three" }));
    await expect(structuredCall(args)).rejects.toThrow();
  });

  it("no tool_use block in the reply → throws", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "sorry" }] });
    await expect(structuredCall(args)).rejects.toThrow(/no tool_use block/);
  });

  it("network/SDK rejection propagates (caller owns retry + fixture)", async () => {
    createMock.mockRejectedValue(new Error("timeout"));
    await expect(structuredCall(args)).rejects.toThrow("timeout");
  });
});

describe("structuredCall with mcpServers (plan Task 11)", () => {
  const mcpServers = [{ type: "url" as const, name: "github", url: "https://api.githubcopilot.com/mcp/", authorization_token: "ghp_x" }];

  it("routes through client.beta.messages.create (not the non-beta path) when mcpServers is non-empty", async () => {
    const payload = { title: "hello", count: 3, tags: ["a", "b"] };
    createBetaMock.mockResolvedValue(toolUse(payload));
    const out = await structuredCall({ ...args, mcpServers });
    expect(out).toEqual(payload);
    expect(createBetaMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("passes mcp_servers, the MCP beta header, and an mcp_toolset tool per server", async () => {
    createBetaMock.mockResolvedValue(toolUse({ title: "x", count: 1, tags: [] }));
    await structuredCall({ ...args, mcpServers });
    const req = createBetaMock.mock.calls[0][0];
    expect(req.mcp_servers).toEqual(mcpServers);
    expect(req.betas).toContain("mcp-client-2025-11-20");
    expect(req.tool_choice).toEqual({ type: "tool", name: "emit" });
    // The forced emit tool is still present, plus one mcp_toolset tool for the server.
    expect(req.tools).toHaveLength(2);
    expect(req.tools[0].name).toBe("emit");
    expect(req.tools[1]).toEqual({ type: "mcp_toolset", mcp_server_name: "github" });
  });

  it("falls back to the non-beta path when mcpServers is undefined or empty", async () => {
    createMock.mockResolvedValue(toolUse({ title: "x", count: 1, tags: [] }));
    await structuredCall({ ...args, mcpServers: [] });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createBetaMock).not.toHaveBeenCalled();
  });

  it("no tool_use block in an mcp-branch reply → throws", async () => {
    createBetaMock.mockResolvedValue({ content: [{ type: "text", text: "sorry" }] });
    await expect(structuredCall({ ...args, mcpServers })).rejects.toThrow(/no tool_use block/);
  });
});

// P4.5: exploreWithTools is the genuine multi-turn research helper — deliberately WITHOUT a
// forced tool_choice — that lets the model actually call the connected MCP tools before
// answering. These tests exercise it directly against the mocked beta SDK.
describe("exploreWithTools (mocked SDK)", () => {
  const mcpServers = [{ type: "url" as const, name: "github", url: "https://api.githubcopilot.com/mcp/", authorization_token: "ghp_x" }];

  it("calls beta.messages.create with mcp_servers + one mcp_toolset tool per server, and NO forced tool_choice", async () => {
    createBetaMock.mockResolvedValue({ content: [{ type: "text", text: "synthesis" }], stop_reason: "end_turn" });
    const out = await exploreWithTools({ system: "sys", user: "usr", mcpServers });

    expect(createBetaMock).toHaveBeenCalledTimes(1);
    const req = createBetaMock.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-4-8");
    expect(req.mcp_servers).toEqual(mcpServers);
    expect(req.betas).toContain("mcp-client-2025-11-20");
    expect(req.tool_choice).toBeUndefined();
    expect(req.tools).toEqual([{ type: "mcp_toolset", mcp_server_name: "github" }]);
    expect(out).toContain("synthesis");
  });

  it("surfaces mcp_tool_use / mcp_tool_result content blocks as text for phase 2", async () => {
    createBetaMock.mockResolvedValue({
      content: [
        { type: "mcp_tool_use", id: "1", name: "read_file", server_name: "github", input: { path: "README.md" } },
        { type: "mcp_tool_result", tool_use_id: "1", is_error: false, content: [{ type: "text", text: "# Hello world" }] },
        { type: "text", text: "Final synthesis." },
      ],
      stop_reason: "end_turn",
    });
    const out = await exploreWithTools({ system: "sys", user: "usr", mcpServers });

    expect(out).toContain("read_file");
    expect(out).toContain("github");
    expect(out).toContain("# Hello world");
    expect(out).toContain("Final synthesis.");
  });

  it("marks an errored mcp_tool_result distinctly", async () => {
    createBetaMock.mockResolvedValue({
      content: [{ type: "mcp_tool_result", tool_use_id: "1", is_error: true, content: "permission denied" }],
      stop_reason: "end_turn",
    });
    const out = await exploreWithTools({ system: "sys", user: "usr", mcpServers });
    expect(out).toContain("error");
    expect(out).toContain("permission denied");
  });

  it("loops while stop_reason is pause_turn, replaying the response back as-is, then stops", async () => {
    createBetaMock
      .mockResolvedValueOnce({ content: [{ type: "text", text: "step1" }], stop_reason: "pause_turn" })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "step2" }], stop_reason: "end_turn" });

    const out = await exploreWithTools({ system: "sys", user: "usr", mcpServers, maxSteps: 5 });

    expect(createBetaMock).toHaveBeenCalledTimes(2);
    // The second call's messages carry the first turn's assistant content appended.
    const secondReq = createBetaMock.mock.calls[1][0];
    expect(secondReq.messages).toHaveLength(2);
    expect(secondReq.messages[1].role).toBe("assistant");
    expect(out).toContain("step1");
    expect(out).toContain("step2");
  });

  it("never exceeds maxSteps even if stop_reason stays pause_turn forever", async () => {
    createBetaMock.mockResolvedValue({ content: [{ type: "text", text: "loop" }], stop_reason: "pause_turn" });
    await exploreWithTools({ system: "sys", user: "usr", mcpServers, maxSteps: 3 });
    expect(createBetaMock).toHaveBeenCalledTimes(3);
  });

  it("propagates SDK errors (caller owns retry/fallback) — never swallows here", async () => {
    createBetaMock.mockRejectedValue(new Error("boom"));
    await expect(exploreWithTools({ system: "sys", user: "usr", mcpServers })).rejects.toThrow("boom");
  });
});
