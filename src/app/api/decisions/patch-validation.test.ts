// P2-T2 · schema-level unit tests for the PATCH /api/decisions/[id] request body. Exercises the
// zod shape directly (no HTTP/mocking needed) — see [id]/route.test.ts for the wired-in route
// behavior (401/404/500 + the DB patch mapping).
import { describe, it, expect } from "vitest";
import { PatchBody } from "@/app/api/decisions/[id]/patch-schema";

describe("PatchBody", () => {
  it("rejects a bad outcome", () => {
    expect(PatchBody.safeParse({ outcome: "maybe" }).success).toBe(false);
  });

  it("accepts a held outcome with categories", () => {
    const r = PatchBody.safeParse({ outcome: "held", materializedCategories: ["execution"] });
    expect(r.success).toBe(true);
  });

  it("accepts a failed outcome with no categories", () => {
    expect(PatchBody.safeParse({ outcome: "failed" }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(PatchBody.safeParse({}).success).toBe(false);
  });

  it("rejects a malformed verdict", () => {
    expect(PatchBody.safeParse({ verdict: { integrity: "high" } }).success).toBe(false);
  });

  it("accepts a well-formed verdict", () => {
    const r = PatchBody.safeParse({
      verdict: { integrity: 62, keystoneId: "k", failedIds: [], loadApplied: false },
    });
    expect(r.success).toBe(true);
  });

  it("accepts isPublic alone", () => {
    expect(PatchBody.safeParse({ isPublic: true }).success).toBe(true);
  });

  it("rejects materializedCategories with non-string entries", () => {
    expect(PatchBody.safeParse({ materializedCategories: [1, 2] }).success).toBe(false);
  });

  it("rejects an unknown outcome-shaped typo alongside a valid field (still validates outcome enum)", () => {
    expect(PatchBody.safeParse({ isPublic: true, outcome: "maybe" }).success).toBe(false);
  });
});
