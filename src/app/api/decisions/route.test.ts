import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeQuery, makeSupabase } from "./supabase-mock";
import type { DecisionRow } from "@/lib/supabase/types";

const { createServerSupabaseMock } = vi.hoisted(() => ({ createServerSupabaseMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: createServerSupabaseMock }));

function fixtureRow(overrides: Partial<DecisionRow> = {}): DecisionRow {
  return {
    id: "d-1",
    user_id: "u-1",
    title: "Migrate to microservices",
    mode: "A",
    input: { businessContextText: "", technicalContextText: "", temporalContextText: "", decisionText: "d" },
    company_context: null,
    pack: null,
    graph: { thesisId: "t", nodes: [] },
    verdict: { integrity: 62, keystoneId: "k", failedIds: [], loadApplied: false },
    seq: 1,
    is_public: false,
    created_at: "2026-07-04T03:30:00Z",
    updated_at: "2026-07-04T03:30:00Z",
    ...overrides,
  };
}

function req(body?: unknown, method: "GET" | "POST" = "GET"): Request {
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

describe("GET /api/decisions", () => {
  it("401s when unauthenticated", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, from: () => makeQuery({ data: null, error: null }) }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("lists the authed user's decisions (seq desc), never leaking another user's rows shape", async () => {
    const rows = [fixtureRow({ id: "d-2", seq: 2 }), fixtureRow({ id: "d-1", seq: 1 })];
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: rows, error: null }) }),
    );
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ id: string; savedAtISO: string; isPublic: boolean }> };
    expect(body.entries.map((e) => e.id)).toEqual(["d-2", "d-1"]);
    expect(body.entries[0].savedAtISO).toBe(rows[0].created_at);
    expect(body.entries[0].isPublic).toBe(false);
  });

  it("never throws a 500 on a DB error — returns a clean error json", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: { message: "db down" } }) }),
    );
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.error).toBe("db down");
  });

  it("never throws even if createServerSupabase itself rejects", async () => {
    createServerSupabaseMock.mockRejectedValue(new Error("cookies unavailable"));
    const { GET } = await import("./route");
    await expect(GET()).resolves.toBeInstanceOf(Response);
  });
});

describe("POST /api/decisions", () => {
  it("401s when unauthenticated", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, from: () => makeQuery({ data: null, error: null }) }));
    const { POST } = await import("./route");
    const res = await POST(req({ title: "x", mode: "A", graph: {}, verdict: {} }, "POST"));
    expect(res.status).toBe(401);
  });

  it("400s on an invalid payload (missing graph)", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: null }) }),
    );
    const { POST } = await import("./route");
    const res = await POST(req({ title: "x", mode: "A" }, "POST"));
    expect(res.status).toBe(400);
  });

  it("computes the next seq server-side (max + 1) and inserts it", async () => {
    const inserted = fixtureRow({ id: "d-3", seq: 6 });
    let insertedWith: Record<string, unknown> | null = null;
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({
        userId: "u-1",
        from: (_table, call) => {
          if (call === 0) return makeQuery({ data: { seq: 5 }, error: null }); // the max-seq lookup
          const q = makeQuery({ data: inserted, error: null });
          const realInsert = q.insert as (v: unknown) => unknown;
          q.insert = (v: Record<string, unknown>) => {
            insertedWith = v;
            return realInsert(v);
          };
          return q;
        },
      }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      req({ title: "New decision", mode: "A", input: {}, companyContext: null, pack: null, graph: { thesisId: "t", nodes: [] }, verdict: { integrity: 1, keystoneId: null, failedIds: [], loadApplied: false } }, "POST"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entry: { id: string } };
    expect(body.entry.id).toBe("d-3");
    expect(insertedWith).not.toBeNull();
    expect((insertedWith as unknown as { seq: number }).seq).toBe(6); // max(5) + 1
  });

  it("starts at seq 1 when the user has no prior decisions", async () => {
    const inserted = fixtureRow({ id: "d-first", seq: 1 });
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({
        userId: "u-1",
        from: (_table, call) =>
          call === 0 ? makeQuery({ data: null, error: null }) : makeQuery({ data: inserted, error: null }),
      }),
    );
    const { POST } = await import("./route");
    const res = await POST(
      req({ title: "First", mode: "A", graph: { thesisId: "t", nodes: [] }, verdict: { integrity: 1, keystoneId: null, failedIds: [], loadApplied: false } }, "POST"),
    );
    const body = (await res.json()) as { entry: { seq: number } };
    expect(body.entry.seq).toBe(1);
  });
});
