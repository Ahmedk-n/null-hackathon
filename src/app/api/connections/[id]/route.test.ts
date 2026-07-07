import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { PATCH, DELETE } from "./route";

function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://x/api/connections/c1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
});

describe("PATCH /api/connections/[id]", () => {
  it("401s when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(jsonReq("PATCH", { name: "x" }), ctx);
    expect(res.status).toBe(401);
  });

  it("400s with no updatable fields", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(jsonReq("PATCH", {}), ctx);
    expect(res.status).toBe(400);
  });

  it("updates and never returns `secret` even when one was submitted", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const updated = {
      id: "c1",
      user_id: "u1",
      kind: "github",
      name: "Renamed",
      url: "https://api.githubcopilot.com/mcp/",
      status: "untested",
      last_used_at: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    fromMock.mockReturnValue(chainable({ data: updated, error: null }));

    const res = await PATCH(jsonReq("PATCH", { name: "Renamed", secret: "sekrit" }), ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { connection: Record<string, unknown> };
    expect(data.connection).not.toHaveProperty("secret");
    expect(data.connection.name).toBe("Renamed");
  });
});

describe("DELETE /api/connections/[id]", () => {
  it("401s when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(jsonReq("DELETE"), ctx);
    expect(res.status).toBe(401);
  });

  it("deletes and returns ok:true", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue(chainable({ error: null }));
    const res = await DELETE(jsonReq("DELETE"), ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("never 500s on a delete error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue(chainable({ error: { message: "db down" } }));
    const res = await DELETE(jsonReq("DELETE"), ctx);
    expect(res.status).toBeLessThan(500);
    const data = (await res.json()) as { ok: boolean; error?: string };
    expect(data.ok).toBe(false);
  });
});
