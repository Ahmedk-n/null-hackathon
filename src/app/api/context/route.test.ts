import { describe, it, expect, beforeEach } from "vitest";
import { POST as contextPOST } from "./route";
import { HERO_CONTEXT_INPUT } from "@/context";
import { ContextCompileSchema } from "@/context";

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
});
