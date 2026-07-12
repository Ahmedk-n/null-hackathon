import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeQuery, makeSupabase } from "../supabase-mock";
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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(body?: unknown, method: "GET" | "PATCH" | "DELETE" = "GET"): Request {
  return new Request(`http://x/api/decisions/d-1`, {
    method,
    ...(body !== undefined
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

beforeEach(() => {
  createServerSupabaseMock.mockReset();
});

describe("GET /api/decisions/[id]", () => {
  it("401s when unauthenticated", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, from: () => makeQuery({ data: null, error: null }) }));
    const { GET } = await import("./route");
    const res = await GET(req(), ctx("d-1"));
    expect(res.status).toBe(401);
  });

  it("404s when the row is missing / not owned (RLS-filtered)", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: null }) }),
    );
    const { GET } = await import("./route");
    const res = await GET(req(), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("returns the owned decision mapped to the LibraryEntry-ish shape", async () => {
    const row = fixtureRow();
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: row, error: null }) }),
    );
    const { GET } = await import("./route");
    const res = await GET(req(), ctx("d-1"));
    const body = (await res.json()) as { entry: { id: string; savedAtISO: string } };
    expect(body.entry.id).toBe("d-1");
    expect(body.entry.savedAtISO).toBe(row.created_at);
  });
});

describe("PATCH /api/decisions/[id]", () => {
  it("401s when unauthenticated", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, from: () => makeQuery({ data: null, error: null }) }));
    const { PATCH } = await import("./route");
    const res = await PATCH(req({ isPublic: true }, "PATCH"), ctx("d-1"));
    expect(res.status).toBe(401);
  });

  it("400s when the body has neither verdict nor isPublic", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: null }) }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(req({}, "PATCH"), ctx("d-1"));
    expect(res.status).toBe(400);
  });

  it("patches the verdict and returns the updated row", async () => {
    const newVerdict = { integrity: 4, keystoneId: "k2", failedIds: ["z"], loadApplied: true };
    const updated = fixtureRow({ verdict: newVerdict });
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: updated, error: null }) }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(req({ verdict: newVerdict }, "PATCH"), ctx("d-1"));
    const body = (await res.json()) as { entry: { verdict: unknown } };
    expect(body.entry.verdict).toEqual(newVerdict);
  });

  it("patches isPublic (the Task 7 share toggle)", async () => {
    const updated = fixtureRow({ is_public: true });
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: updated, error: null }) }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(req({ isPublic: true }, "PATCH"), ctx("d-1"));
    const body = (await res.json()) as { entry: { isPublic: boolean } };
    expect(body.entry.isPublic).toBe(true);
  });

  it("404s when the row is missing / not owned", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: null }) }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(
      req({ verdict: { integrity: 62, keystoneId: "k", failedIds: [], loadApplied: false } }, "PATCH"),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("400s on a malformed verdict shape (hardened validation)", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: null }) }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(req({ verdict: {} }, "PATCH"), ctx("d-1"));
    expect(res.status).toBe(400);
  });

  it("400s on an invalid outcome value", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: null }) }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(req({ outcome: "maybe" }, "PATCH"), ctx("d-1"));
    expect(res.status).toBe(400);
  });

  it("resolves an outcome: sets outcome, materialized_categories, and stamps resolved_at", async () => {
    const updated = fixtureRow({
      outcome: "held",
      materialized_categories: ["execution"],
      resolved_at: "2026-07-12T00:00:00Z",
    });
    let capturedPatch: Record<string, unknown> | null = null;
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({
        userId: "u-1",
        from: () => {
          const q = makeQuery({ data: updated, error: null });
          const realUpdate = q.update as (v: unknown) => unknown;
          q.update = (v: Record<string, unknown>) => {
            capturedPatch = v;
            return realUpdate(v);
          };
          return q;
        },
      }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(req({ outcome: "held", materializedCategories: ["execution"] }, "PATCH"), ctx("d-1"));
    const body = (await res.json()) as {
      entry: { outcome: string; materializedCategories: string[]; resolvedAtISO: string };
    };
    expect(res.status).toBe(200);
    expect(body.entry.outcome).toBe("held");
    expect(body.entry.materializedCategories).toEqual(["execution"]);
    expect(body.entry.resolvedAtISO).toBe("2026-07-12T00:00:00Z");
    expect(capturedPatch).toMatchObject({
      outcome: "held",
      materialized_categories: ["execution"],
    });
    expect(typeof (capturedPatch as unknown as Record<string, unknown>)?.resolved_at).toBe("string");
  });
});

describe("DELETE /api/decisions/[id]", () => {
  it("401s when unauthenticated", async () => {
    createServerSupabaseMock.mockResolvedValue(makeSupabase({ userId: null, from: () => makeQuery({ data: null, error: null }) }));
    const { DELETE } = await import("./route");
    const res = await DELETE(req(undefined, "DELETE"), ctx("d-1"));
    expect(res.status).toBe(401);
  });

  it("deletes and returns ok", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: null }) }),
    );
    const { DELETE } = await import("./route");
    const res = await DELETE(req(undefined, "DELETE"), ctx("d-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("never throws a 500 on a DB error", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: "u-1", from: () => makeQuery({ data: null, error: { message: "db down" } }) }),
    );
    const { DELETE } = await import("./route");
    const res = await DELETE(req(undefined, "DELETE"), ctx("d-1"));
    const body = await res.json();
    expect(body.error).toBe("db down");
  });
});
