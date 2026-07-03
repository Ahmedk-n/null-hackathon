import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { GatherFindingsSchema } from "@/agents/schemas";
import type { AgentEvent } from "@/agents/types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function req(body: unknown): Request {
  return new Request("http://x/api/gather", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function parseSSE(text: string): AgentEvent[] {
  return text
    .split("\n\n")
    .filter((c) => c.includes("data:"))
    .map((chunk) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) throw new Error("no data line");
      return JSON.parse(line.slice(5).trim()) as AgentEvent;
    });
}

describe("POST /api/gather", () => {
  it("streams AgentEvents ending in done/fixture with schema-valid findings (no key)", async () => {
    const res = await POST(req({ kind: "business", source: {} }));

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    const events = parseSSE(await res.text());
    expect(events.length).toBeGreaterThan(0);

    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") {
      expect(last.source).toBe("fixture");
      expect(() => GatherFindingsSchema.parse(last.findings)).not.toThrow();
    }

    // Timestamps are ISO strings stamped by the route.
    expect(events.every((e) => !Number.isNaN(Date.parse(e.ts)))).toBe(true);
  });

  it("technical kind (no repoUrl) also streams a fixture done", async () => {
    const res = await POST(req({ kind: "technical", source: {} }));
    const events = parseSSE(await res.text());
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("fixture");
  });
});
