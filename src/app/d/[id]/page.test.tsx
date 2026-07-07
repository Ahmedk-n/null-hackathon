// P2-T7 · /d/[id] SERVER component — the fetch + not-found routing (ShareView's own render is
// covered by share-view.test.tsx). Calls the async server-component function directly and inspects
// the returned element, per the usual pattern for testing Next server components without a full
// render pipeline.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeQuery, makeSupabase } from "@/app/api/decisions/supabase-mock";
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
    graph: { thesisId: "t", nodes: [{ id: "t", type: "thesis", label: "T", confidence: 0.8, groups: [] }] },
    verdict: { integrity: 62, keystoneId: "k", failedIds: [], loadApplied: false },
    seq: 1,
    is_public: true,
    created_at: "2026-07-04T03:30:00Z",
    updated_at: "2026-07-04T03:30:00Z",
    ...overrides,
  };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  createServerSupabaseMock.mockReset();
});

describe("GET /d/[id] (server component)", () => {
  it("renders ShareView with the public row mapped to a ShareDecision", async () => {
    const row = fixtureRow();
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: null, from: () => makeQuery({ data: row, error: null }) }),
    );
    const { default: SharedDecisionPage } = await import("./page");
    const element = await SharedDecisionPage(ctx("d-1"));
    expect(element.props.decision).toMatchObject({
      id: "d-1",
      title: "Migrate to microservices",
      savedAtISO: row.created_at,
      mode: "A",
    });
    expect(element.props.decision.verdict.integrity).toBe(62);
  });

  it("calls notFound() when the row doesn't exist / isn't public", async () => {
    createServerSupabaseMock.mockResolvedValue(
      makeSupabase({ userId: null, from: () => makeQuery({ data: null, error: null }) }),
    );
    const { default: SharedDecisionPage } = await import("./page");
    await expect(SharedDecisionPage(ctx("missing"))).rejects.toThrow();
  });

  it("never throws a 500 — a Supabase lookup failure also reads as not-found", async () => {
    createServerSupabaseMock.mockRejectedValue(new Error("cookies unavailable"));
    const { default: SharedDecisionPage } = await import("./page");
    await expect(SharedDecisionPage(ctx("d-1"))).rejects.toThrow(); // notFound(), not the raw error
  });
});
