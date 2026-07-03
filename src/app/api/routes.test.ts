import { describe, it, expect, beforeEach } from "vitest";
import { POST as extractPOST } from "./extract/route";
import { POST as attacksPOST } from "./attacks/route";
import { fixtureGraph } from "@/llm/fixture";
import { GraphSchema, AttacksSchema } from "@/llm/schemas";

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
