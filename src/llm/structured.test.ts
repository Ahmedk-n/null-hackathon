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
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

// Imported AFTER the mock is registered so structuredCall uses the stub SDK.
import { structuredCall, hasApiKey, MODEL, MAX_TOKENS } from "./structured";

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
