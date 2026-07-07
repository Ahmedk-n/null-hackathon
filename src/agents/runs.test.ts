import { describe, it, expect, vi, beforeEach } from "vitest";

const { createAdminSupabaseMock } = vi.hoisted(() => ({ createAdminSupabaseMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: createAdminSupabaseMock }));

import { checkRunAllowed, logRun } from "./runs";

// Mimics the two `.from("runs").select("id", {count:"exact",head:true}).eq(...).gte(...)`
// calls `checkRunAllowed` makes (hourly, then monthly) — each call to `from` returns a
// fresh chainable resolving to the next queued count/error pair.
function adminWithCounts(results: { count: number | null; error: unknown }[]) {
  let call = 0;
  const from = vi.fn(() => {
    const result = results[Math.min(call, results.length - 1)];
    call++;
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => Promise.resolve(result)),
    };
    return chain;
  });
  return { from };
}

beforeEach(() => {
  createAdminSupabaseMock.mockReset();
});

describe("checkRunAllowed", () => {
  it("allows a user comfortably under both caps", async () => {
    createAdminSupabaseMock.mockReturnValue(
      adminWithCounts([
        { count: 2, error: null },
        { count: 10, error: null },
      ]),
    );
    const result = await checkRunAllowed("u1");
    expect(result).toEqual({ allowed: true });
  });

  it("blocks with a reason when the hourly cap (30/hr) is reached", async () => {
    createAdminSupabaseMock.mockReturnValue(
      adminWithCounts([
        { count: 30, error: null },
        { count: 30, error: null },
      ]),
    );
    const result = await checkRunAllowed("u1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/hourly/i);
  });

  it("blocks with a reason when the monthly cap (500/mo) is reached but hourly is fine", async () => {
    createAdminSupabaseMock.mockReturnValue(
      adminWithCounts([
        { count: 1, error: null },
        { count: 500, error: null },
      ]),
    );
    const result = await checkRunAllowed("u1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/monthly/i);
  });

  it("fails OPEN (allowed) when the count query errors", async () => {
    createAdminSupabaseMock.mockReturnValue(
      adminWithCounts([
        { count: null, error: { message: "db unreachable" } },
        { count: null, error: null },
      ]),
    );
    const result = await checkRunAllowed("u1");
    expect(result).toEqual({ allowed: true });
  });

  it("fails OPEN when createAdminSupabase itself throws", async () => {
    createAdminSupabaseMock.mockImplementation(() => {
      throw new Error("no SUPABASE_SECRET_KEY");
    });
    const result = await checkRunAllowed("u1");
    expect(result).toEqual({ allowed: true });
  });
});

describe("logRun", () => {
  it("inserts a run row with the given fields", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    createAdminSupabaseMock.mockReturnValue({ from: vi.fn(() => ({ insert })) });

    await logRun("u1", "technical", "live", 1234, 567);

    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      kind: "technical",
      source: "live",
      tokens_in: 1234,
      tokens_out: 567,
    });
  });

  it("never throws even when the insert rejects", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("insert failed"));
    createAdminSupabaseMock.mockReturnValue({ from: vi.fn(() => ({ insert })) });

    await expect(logRun("u1", "business", "fixture", 0, 0)).resolves.toBeUndefined();
  });

  it("never throws even when createAdminSupabase throws", async () => {
    createAdminSupabaseMock.mockImplementation(() => {
      throw new Error("no admin client");
    });
    await expect(logRun("u1", "temporal", "fixture", 0, 0)).resolves.toBeUndefined();
  });
});
