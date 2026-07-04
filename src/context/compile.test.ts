import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { compileContext } from "./compile";
import { ContextCompileSchema } from "./schemas";
import {
  HERO_CONTEXT_INPUT,
  REINFORCE_CONTEXT_INPUT,
  REAL_CONTEXT_INPUT,
  fixtureCompanyContext,
  fixtureDecisionContextPack,
} from "./fixtures";

// Module-mock the SDK so the live path never touches the network. `create` is a hoisted
// vi.fn we drive per-test; `new Anthropic({...})` returns an instance whose messages.create
// is that mock. Wave B: compileContext now goes through structuredCall (a FORCED tool call), so
// a live payload is a `tool_use` content block whose `input` is the schema-shaped object.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

// A schema-valid live payload, tagged so we can prove the result came from the model, not
// the fixture fallback.
function liveMessage() {
  const companyContext = fixtureCompanyContext();
  companyContext.business.companyStage = "LIVE-STAGE";
  const decisionContextPack = fixtureDecisionContextPack("Live decision text");
  const input = { companyContext, decisionContextPack };
  return { content: [{ type: "tool_use", id: "toolu_1", name: "emit_context", input }] };
}

beforeEach(() => {
  createMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("compileContext — fixture invariants (no live call)", () => {
  it("scenario passed + key present → source 'fixture' and NO SDK call (fixtures always win)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    const res = await compileContext(HERO_CONTEXT_INPUT, "A");
    expect(res.source).toBe("fixture");
    expect(res.decisionContextPack.decision).toBe(HERO_CONTEXT_INPUT.decisionText);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("scenario 'B' + key present → the reinforce fixture pack, source 'fixture'", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    const res = await compileContext(REINFORCE_CONTEXT_INPUT, "B");
    expect(res.source).toBe("fixture");
    expect(res.decisionContextPack.decision).toBe(REINFORCE_CONTEXT_INPUT.decisionText);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("no key + no scenario → source 'fixture' and NO SDK call", async () => {
    const res = await compileContext(HERO_CONTEXT_INPUT);
    expect(res.source).toBe("fixture");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("scenario 'R' + key present → the real Excalidraw fixture pack, source 'fixture', no SDK call", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    const res = await compileContext(REAL_CONTEXT_INPUT, "R");
    expect(res.source).toBe("fixture");
    expect(res.decisionContextPack.decision).toBe(REAL_CONTEXT_INPUT.decisionText);
    expect(res.companyContext.business.industry).toContain("whiteboard");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("compileContext — live path (mocked SDK)", () => {
  it("key + no scenario + valid JSON → source 'live' with the model's own output", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    createMock.mockResolvedValue(liveMessage());

    const res = await compileContext(HERO_CONTEXT_INPUT);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(res.source).toBe("live");
    expect(res.companyContext.business.companyStage).toBe("LIVE-STAGE");
    expect(res.decisionContextPack.decision).toBe("Live decision text");
    expect(() =>
      ContextCompileSchema.parse({
        companyContext: res.companyContext,
        decisionContextPack: res.decisionContextPack,
      }),
    ).not.toThrow();
  });

  it("clamps out-of-range live scores rather than falling back", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    const msg = liveMessage();
    msg.content[0].input.companyContext.temporal.urgencyLevel = 4;
    createMock.mockResolvedValue(msg);

    const res = await compileContext(HERO_CONTEXT_INPUT);
    expect(res.source).toBe("live");
    expect(res.companyContext.temporal.urgencyLevel).toBe(1);
  });

  it("no-tool_use (garbage text) response → fixture fallback, never throws", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    createMock.mockResolvedValue({ content: [{ type: "text", text: "sorry, no JSON here" }] });

    const res = await compileContext(HERO_CONTEXT_INPUT);
    expect(res.source).toBe("fixture");
    // Wave B: no tool_use block → structuredCall THROWS → retryOnce retries once (2 calls) →
    // the catch → fixture fallback. (Previously a resolved-but-unusable text reply did not throw,
    // so retryOnce did not re-run; the forced-tool transport routes malformed output through throw.)
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(res.decisionContextPack.decision).toBe(HERO_CONTEXT_INPUT.decisionText);
  });

  it("schema-invalid tool input → fixture fallback", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", id: "toolu_1", name: "emit_context", input: { companyContext: {}, nope: 1 } }],
    });

    const res = await compileContext(HERO_CONTEXT_INPUT);
    expect(res.source).toBe("fixture");
  });

  it("SDK rejection (e.g. timeout) → fixture fallback after the retry", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    createMock.mockRejectedValue(new Error("timeout"));

    const res = await compileContext(HERO_CONTEXT_INPUT);
    expect(res.source).toBe("fixture");
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
