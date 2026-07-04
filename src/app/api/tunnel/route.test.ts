import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { scriptedDuelGraphR, type TunnelEvent } from "@/context/tunnel";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/tunnel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read the SSE body of a Response into an array of parsed TunnelEvents. */
async function readEvents(res: Response): Promise<TunnelEvent[]> {
  const text = await res.text();
  const out: TunnelEvent[] = [];
  for (const frame of text.split("\n\n")) {
    const line = frame.split("\n").find((l) => l.startsWith("data:"));
    if (line) out.push(JSON.parse(line.slice(5).trim()) as TunnelEvent);
  }
  return out;
}

describe("POST /api/tunnel (offline → scripted scenario-R duel)", () => {
  it("streams text/event-stream and ends in a well-formed done", async () => {
    const res = await POST(jsonReq({ graph: scriptedDuelGraphR(), scenario: "R" }));
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await readEvents(res);
    expect(events.length).toBeGreaterThan(0);

    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") {
      expect(["STANDS", "FALLS"]).toContain(last.verdict);
      expect(last.verdict).toBe("STANDS");
      expect(last.holds).toBe(3);
      expect(last.cracks).toBe(2);
    }

    // ISO timestamps are stamped by the route (never empty / a placeholder).
    expect(events.every((e) => typeof e.ts === "string" && e.ts.length > 0)).toBe(true);
    // Round cadence present.
    expect(events.filter((e) => e.type === "proposal").length).toBe(5);
    expect(events.filter((e) => e.type === "counter").length).toBe(5);
  });

  it("works with no scenario passed (no key → scripted), never 500s", async () => {
    const res = await POST(jsonReq({ graph: scriptedDuelGraphR() }));
    expect(res.status).toBe(200);
    const events = await readEvents(res);
    expect(events[events.length - 1].type).toBe("done");
  });
});
