import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks for the authed-user path (plan Task 11): a signed-in user's connections feed
// buildMcpServers -> mcpServers, and checkRunAllowed/logRun guard + record the run. Guest
// tests below rely on the REAL createServerSupabase throwing (no Next.js request scope
// under vitest) -> the route's outer try/catch degrades to guest behavior, so they don't
// need any of these mocks.
const { getUserMock, adminSelectMock, checkRunAllowedMock, logRunMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  adminSelectMock: vi.fn(),
  checkRunAllowedMock: vi.fn(),
  logRunMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: adminSelectMock,
      })),
    })),
  })),
}));
vi.mock("@/agents/runs", () => ({
  checkRunAllowed: checkRunAllowedMock,
  logRun: logRunMock,
}));

import { POST } from "./route";
import { GatherFindingsSchema } from "@/agents/schemas";
import type { AgentEvent } from "@/agents/types";
import type { ConnectionRow } from "@/lib/supabase/types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  getUserMock.mockReset();
  adminSelectMock.mockReset();
  checkRunAllowedMock.mockReset();
  logRunMock.mockReset();
  // Default: no session (matches the guest-degrade path most tests below exercise).
  getUserMock.mockResolvedValue({ data: { user: null } });
  checkRunAllowedMock.mockResolvedValue({ allowed: true });
  logRunMock.mockResolvedValue(undefined);
  adminSelectMock.mockResolvedValue({ data: [], error: null });
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

  it("guest path never touches the run guard/logger even with an explicit null session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await POST(req({ kind: "temporal", source: { notes: "" } }));
    expect(checkRunAllowedMock).not.toHaveBeenCalled();
    expect(logRunMock).not.toHaveBeenCalled();
  });

  describe("signed-in user", () => {
    const rows: ConnectionRow[] = [
      {
        id: "c1",
        user_id: "u1",
        kind: "github",
        name: "GitHub",
        url: "https://api.githubcopilot.com/mcp/",
        secret: "ghp_x",
        status: "ok",
        last_used_at: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    it("loads connections, checks the run guard, and logs a run after gather resolves", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
      adminSelectMock.mockResolvedValue({ data: rows, error: null });

      const res = await POST(req({ kind: "temporal", source: { notes: "" } }));
      const events = parseSSE(await res.text());
      const last = events[events.length - 1];
      expect(last.type).toBe("done");

      expect(checkRunAllowedMock).toHaveBeenCalledWith("u1");
      expect(logRunMock).toHaveBeenCalledTimes(1);
      expect(logRunMock).toHaveBeenCalledWith("u1", "temporal", "fixture", 0, 0);
    });

    it("run-limit reached: emits an honest error event and skips the call entirely (no logRun)", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
      checkRunAllowedMock.mockResolvedValue({ allowed: false, reason: "hourly run limit reached (30/hr)" });

      const res = await POST(req({ kind: "business", source: {} }));
      const events = parseSSE(await res.text());

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      if (events[0].type === "error") expect(events[0].message).toMatch(/run limit/i);
      expect(logRunMock).not.toHaveBeenCalled();
    });

    it("degrades to guest behavior (no rate limit, no crash) if the admin/connections lookup throws", async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
      adminSelectMock.mockRejectedValue(new Error("db unreachable"));

      const res = await POST(req({ kind: "temporal", source: { notes: "" } }));
      const events = parseSSE(await res.text());
      const last = events[events.length - 1];
      expect(last.type).toBe("done");
      if (last.type === "done") expect(last.source).toBe("fixture");
      // Still a signed-in user, so the run guard/logger are still exercised.
      expect(checkRunAllowedMock).toHaveBeenCalledWith("u1");
    });
  });
});
