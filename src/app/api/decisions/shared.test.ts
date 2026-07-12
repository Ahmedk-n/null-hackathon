import { describe, it, expect } from "vitest";
import { rowToJSON } from "@/app/api/decisions/shared";

describe("rowToJSON", () => {
  it("maps calibration fields", () => {
    const row: any = {
      id: "d1", title: "t", created_at: "2026-07-12T00:00:00Z", seq: 1, mode: "custom",
      input: {}, company_context: null, pack: null, graph: {}, verdict: {}, is_public: false,
      predicted_p_hold: 0.62, outcome: "failed", resolved_at: "2026-07-13T00:00:00Z",
      materialized_categories: ["execution"],
    };
    const j = rowToJSON(row);
    expect(j.predictedPHold).toBe(0.62);
    expect(j.outcome).toBe("failed");
    expect(j.resolvedAtISO).toBe("2026-07-13T00:00:00Z");
    expect(j.materializedCategories).toEqual(["execution"]);
  });

  it("defaults calibration fields to null when the row has none", () => {
    const row: any = {
      id: "d2", title: "t", created_at: "2026-07-12T00:00:00Z", seq: 1, mode: "custom",
      input: {}, company_context: null, pack: null, graph: {}, verdict: {}, is_public: false,
    };
    const j = rowToJSON(row);
    expect(j.predictedPHold).toBeNull();
    expect(j.outcome).toBeNull();
    expect(j.resolvedAtISO).toBeNull();
    expect(j.materializedCategories).toBeNull();
  });
});
