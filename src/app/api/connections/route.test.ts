import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable Supabase query-builder stub: every method call (select/order/insert/
// update/eq/delete/single/...) returns itself, and awaiting the chain at any point
// resolves to `result` — mirrors the real client's thenable PostgrestFilterBuilder
// without having to model every method signature.
function chainable(result: unknown) {
  const target = () => {};
  const handler: ProxyHandler<typeof target> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return (..._args: unknown[]) => chainable(result);
    },
  };
  return new Proxy(target, handler) as unknown as Record<string, (...args: unknown[]) => unknown>;
}

const { getUserMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

import { GET, POST } from "./route";

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("GET /api/connections", () => {
  it("401s when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lists connections from connections_public with no `secret` field", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const rows = [
      {
        id: "c1",
        user_id: "u1",
        kind: "github",
        name: "GitHub",
        url: "https://api.githubcopilot.com/mcp/",
        status: "untested",
        last_used_at: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    fromMock.mockReturnValue(chainable({ data: rows, error: null }));

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { connections: Record<string, unknown>[] };
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0]).not.toHaveProperty("secret");
    expect(fromMock).toHaveBeenCalledWith("connections_public");
  });

  it("never 500s — a query error degrades to an honest empty list", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue(chainable({ data: null, error: { message: "db down" } }));

    const res = await GET();
    expect(res.status).toBeLessThan(500);
    const data = (await res.json()) as { connections: unknown[]; error?: string };
    expect(data.connections).toEqual([]);
    expect(data.error).toBe("db down");
  });
});

describe("POST /api/connections", () => {
  it("401s when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(jsonReq({ kind: "github" }));
    expect(res.status).toBe(401);
  });

  it("creates a connection, defaulting name/url from the kind preset, and never returns `secret`", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const created = {
      id: "c1",
      user_id: "u1",
      kind: "github",
      name: "GitHub",
      url: "https://api.githubcopilot.com/mcp/",
      status: "untested",
      last_used_at: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    fromMock.mockReturnValue(chainable({ data: created, error: null }));

    const res = await POST(jsonReq({ kind: "github", secret: "ghp_test" }));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { connection: Record<string, unknown> };
    expect(data.connection).not.toHaveProperty("secret");
    expect(data.connection.name).toBe("GitHub");
    expect(data.connection.url).toBe("https://api.githubcopilot.com/mcp/");
  });

  it("400s when the kind has no default url and none is supplied", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(jsonReq({ kind: "custom" }));
    expect(res.status).toBe(400);
  });
});
