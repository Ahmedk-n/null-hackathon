import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const { getUserMock, serverFromMock, adminFromMock, createMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  serverFromMock: vi.fn(),
  adminFromMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: serverFromMock,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: vi.fn(() => ({ from: adminFromMock })),
}));

// Mirrors src/llm/client.test.ts's SDK-mocking approach: stub the default export's
// beta.messages.create so the "with a key" branch never makes a real network call.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create: createMock } };
  },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
function req(): Request {
  return new Request("http://x/api/connections/c1/test", { method: "POST" });
}

const CONNECTION_ROW = { id: "c1", name: "My GitHub", url: "https://api.githubcopilot.com/mcp/" };

beforeEach(() => {
  getUserMock.mockReset();
  serverFromMock.mockReset();
  adminFromMock.mockReset();
  createMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/connections/[id]/test", () => {
  it("401s when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("no ANTHROPIC_API_KEY -> status untested, no throw, row updated", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    serverFromMock.mockReturnValue(chainable({ data: CONNECTION_ROW, error: null }));

    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("untested");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("connection not found -> honest error, no throw", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    serverFromMock.mockReturnValue(chainable({ data: null, error: { message: "not found" } }));

    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("error");
  });

  it("with a key: successful MCP tools-list call -> status ok", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    serverFromMock.mockReturnValue(chainable({ data: CONNECTION_ROW, error: null }));
    adminFromMock.mockReturnValue(chainable({ data: { secret: "ghp_test" }, error: null }));
    createMock.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0] as {
      model: string;
      betas: string[];
      mcp_servers: { type: string; name: string; url: string; authorization_token?: string }[];
      tools: { type: string; mcp_server_name: string }[];
    };
    expect(call.model).toBe("claude-opus-4-8");
    expect(call.betas).toContain("mcp-client-2025-11-20");
    expect(call.mcp_servers[0].url).toBe(CONNECTION_ROW.url);
    expect(call.mcp_servers[0].authorization_token).toBe("ghp_test");
    expect(call.tools[0]).toEqual({ type: "mcp_toolset", mcp_server_name: call.mcp_servers[0].name });
  });

  it("with a key: the MCP call throws -> status error with a short message, never throws", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    serverFromMock.mockReturnValue(chainable({ data: CONNECTION_ROW, error: null }));
    adminFromMock.mockReturnValue(chainable({ data: { secret: null }, error: null }));
    createMock.mockRejectedValue(new Error("connection refused"));

    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; message?: string };
    expect(data.status).toBe("error");
    expect(data.message).toBeTruthy();
  });
});
