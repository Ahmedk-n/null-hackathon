import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as contextPOST } from "./route";
import { HERO_CONTEXT_INPUT, REINFORCE_CONTEXT_INPUT } from "@/context";
import { ContextCompileSchema } from "@/context";
import type { DecisionContextPack } from "@/context";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/context", () => {
  it("returns a schema-valid { companyContext, decisionContextPack } and source=fixture with no key", async () => {
    const res = await contextPOST(jsonReq("http://x/api/context", HERO_CONTEXT_INPUT));
    const data = (await res.json()) as {
      companyContext: unknown;
      decisionContextPack: unknown;
      source: string;
    };
    expect(() =>
      ContextCompileSchema.parse({
        companyContext: data.companyContext,
        decisionContextPack: data.decisionContextPack,
      }),
    ).not.toThrow();
    expect(data.source).toBe("fixture");
  });

  it("reports source=fixture when a scenario is pinned even with ANTHROPIC_API_KEY present (fixtures always win)", async () => {
    // A scenario short-circuits before the live branch, so the rehearsed demo stays
    // byte-deterministic regardless of key presence.
    process.env.ANTHROPIC_API_KEY = "sk-test-not-a-real-key";
    const res = await contextPOST(
      jsonReq("http://x/api/context", { ...HERO_CONTEXT_INPUT, scenario: "A" }),
    );
    const data = (await res.json()) as { source: string };
    expect(data.source).toBe("fixture");
  });

  // ── W2-3 · scenario selection ────────────────────────────────────────
  it("defaults to the hero migrate context (no scenario field)", async () => {
    const res = await contextPOST(jsonReq("http://x/api/context", HERO_CONTEXT_INPUT));
    const data = (await res.json()) as { decisionContextPack: DecisionContextPack };
    expect(data.decisionContextPack.decision).toBe(HERO_CONTEXT_INPUT.decisionText);
  });

  it("routes scenario 'B' to the reinforce context pack", async () => {
    const res = await contextPOST(
      jsonReq("http://x/api/context", { ...REINFORCE_CONTEXT_INPUT, scenario: "B" }),
    );
    const data = (await res.json()) as { decisionContextPack: DecisionContextPack };
    expect(data.decisionContextPack.decision).toBe(REINFORCE_CONTEXT_INPUT.decisionText);
    // The reinforce pack's execution nudge is modest (0.3) vs the hero's maximal 1.0 —
    // this is what keeps scenario B holding under the same context shape.
    const exec = data.decisionContextPack.contextWeightAdjustments.find(
      (a) => a.targetCategory === "execution",
    );
    expect(exec?.magnitude).toBe(0.3);
  });
});
