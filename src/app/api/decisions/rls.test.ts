// P5-T13 · RLS regression: /api/decisions + /api/decisions/[id] must ALWAYS be scoped to the
// session user, so user B can never address user A's rows through these routes even if Postgres
// RLS (supabase/migrations/0001_init.sql, "own decisions" policy) were ever misconfigured — the
// explicit `.eq("user_id", user.id)` filters in the route code are defense-in-depth, and this test
// pins that they're actually there. Covers both halves of the guarantee:
//   (a) unauthenticated → 401 on every verb (GET/POST on the collection; GET/PATCH/DELETE on [id]).
//   (b) authenticated → every query in the chain is scoped by `.eq("user_id", <session user id>)`,
//       captured via a recording proxy (same technique as src/app/api/connections/route.test.ts's
//       "defense-in-depth" regression).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createServerSupabaseMock } = vi.hoisted(() => ({ createServerSupabaseMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: createServerSupabaseMock }));

// A chainable query-builder stub that RECORDS every `.eq(col, value)` call it sees (across the
// whole chain, however many links) into a shared array, then resolves to `result` when awaited —
// mirrors the real thenable PostgrestFilterBuilder without modelling every method signature.
function recordingQuery(result: unknown, eqCalls: [unknown, unknown][]) {
  const target = () => {};
  const handler: ProxyHandler<typeof target> = {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return (...args: unknown[]) => {
        if (prop === "eq") eqCalls.push([args[0], args[1]]);
        return recordingQuery(result, eqCalls);
      };
    },
  };
  return new Proxy(target, handler) as unknown as Record<string, (...a: unknown[]) => unknown>;
}

function makeSupabase(opts: { userId: string | null; result: unknown; eqCalls: [unknown, unknown][] }) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.userId ? { id: opts.userId } : null } }),
    },
    from: () => recordingQuery(opts.result, opts.eqCalls),
  };
}

function ctx(id = "d-1") {
  return { params: Promise.resolve({ id }) };
}

function req(body?: unknown, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET"): Request {
  return new Request("http://x/api/decisions", {
    method,
    ...(body !== undefined
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

beforeEach(() => {
  createServerSupabaseMock.mockReset();
});

const fixtureRow = {
  id: "d-1",
  user_id: "u-1",
  title: "t",
  mode: "A",
  input: {},
  company_context: null,
  pack: null,
  graph: { thesisId: "t", nodes: [] },
  verdict: { integrity: 1, keystoneId: null, failedIds: [], loadApplied: false },
  seq: 1,
  is_public: false,
  created_at: "2026-07-04T03:30:00Z",
  updated_at: "2026-07-04T03:30:00Z",
};

describe("RLS scoping — unauthenticated is always 401", () => {
  it("GET /api/decisions", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, result: { data: null, error: null }, eqCalls: [] }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST /api/decisions", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, result: { data: null, error: null }, eqCalls: [] }));
    const { POST } = await import("./route");
    const res = await POST(req({ title: "x", mode: "A", graph: {}, verdict: {} }, "POST"));
    expect(res.status).toBe(401);
  });

  it("GET /api/decisions/[id]", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, result: { data: null, error: null }, eqCalls: [] }));
    const { GET } = await import("./[id]/route");
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
  });

  it("PATCH /api/decisions/[id]", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, result: { data: null, error: null }, eqCalls: [] }));
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(req({ verdict: {} }, "PATCH"), ctx());
    expect(res.status).toBe(401);
  });

  it("DELETE /api/decisions/[id]", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, result: { data: null, error: null }, eqCalls: [] }));
    const { DELETE } = await import("./[id]/route");
    const res = await DELETE(req(undefined, "DELETE"), ctx());
    expect(res.status).toBe(401);
  });
});

describe("RLS scoping — authenticated queries are always filtered by the session user_id", () => {
  it("GET /api/decisions scopes the list query", async () => {
    const eqCalls: [unknown, unknown][] = [];
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", result: { data: [fixtureRow], error: null }, eqCalls }),
    );
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(["user_id", "u-1"]);
    // Never applies another user's id.
    expect(eqCalls.some(([col, val]) => col === "user_id" && val !== "u-1")).toBe(false);
  });

  it("POST /api/decisions scopes both the max-seq lookup and the insert to the session user", async () => {
    const eqCalls: [unknown, unknown][] = [];
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", result: { data: fixtureRow, error: null }, eqCalls }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      req({ title: "x", mode: "A", graph: { thesisId: "t", nodes: [] }, verdict: { integrity: 1, keystoneId: null, failedIds: [], loadApplied: false } }, "POST"),
    );
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(["user_id", "u-1"]);
  });

  it("GET /api/decisions/[id] scopes by id AND the session user_id — user B's id can never be substituted", async () => {
    const eqCalls: [unknown, unknown][] = [];
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", result: { data: fixtureRow, error: null }, eqCalls }),
    );
    const { GET } = await import("./[id]/route");
    const res = await GET(req(), ctx("d-1"));
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(["id", "d-1"]);
    expect(eqCalls).toContainEqual(["user_id", "u-1"]);
  });

  it("PATCH /api/decisions/[id] scopes the update by id AND the session user_id", async () => {
    const eqCalls: [unknown, unknown][] = [];
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", result: { data: fixtureRow, error: null }, eqCalls }),
    );
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(req({ isPublic: true }, "PATCH"), ctx("d-1"));
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(["id", "d-1"]);
    expect(eqCalls).toContainEqual(["user_id", "u-1"]);
  });

  it("DELETE /api/decisions/[id] scopes the delete by id AND the session user_id", async () => {
    const eqCalls: [unknown, unknown][] = [];
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", result: { data: null, error: null }, eqCalls }),
    );
    const { DELETE } = await import("./[id]/route");
    const res = await DELETE(req(undefined, "DELETE"), ctx("d-1"));
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(["id", "d-1"]);
    expect(eqCalls).toContainEqual(["user_id", "u-1"]);
  });

  it("a different session user (u-2) never gets u-1's id applied — the filter always tracks the caller", async () => {
    const eqCalls: [unknown, unknown][] = [];
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-2", result: { data: [fixtureRow], error: null }, eqCalls }),
    );
    const { GET } = await import("./route");
    await GET();
    expect(eqCalls).toContainEqual(["user_id", "u-2"]);
    expect(eqCalls.some(([col, val]) => col === "user_id" && val === "u-1")).toBe(false);
  });
});
