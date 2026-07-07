import { describe, it, expect } from "vitest";
import { extractFindings, GatherFindingSchema, MIN_FACTS } from "./schemas";

// Build a valid GatherFindings JSON string with `n` source-attributed facts.
function findingsJson(n: number): string {
  const facts = Array.from({ length: n }, (_, i) => ({
    label: `Fact ${i}`,
    value: `Value ${i}`,
    source: `source-${i}`,
  }));
  return JSON.stringify({ kind: "business", summary: "ok", facts });
}

describe("extractFindings (W3-7 · T11 sparse-ledger guard)", () => {
  it(`accepts a parse with exactly MIN_FACTS (${MIN_FACTS}) facts`, () => {
    const res = extractFindings(findingsJson(MIN_FACTS));
    expect(res).not.toBeNull();
    expect(res!.facts.length).toBe(MIN_FACTS);
  });

  it("accepts a parse with more than MIN_FACTS facts", () => {
    expect(extractFindings(findingsJson(MIN_FACTS + 3))).not.toBeNull();
  });

  it("rejects (returns null) a schema-valid parse with fewer than MIN_FACTS facts", () => {
    expect(extractFindings(findingsJson(MIN_FACTS - 1))).toBeNull();
    expect(extractFindings(findingsJson(0))).toBeNull();
  });

  it("tolerates prose around the JSON object", () => {
    const wrapped = `Here are the findings:\n${findingsJson(MIN_FACTS)}\nThanks.`;
    expect(extractFindings(wrapped)).not.toBeNull();
  });

  it("returns null on non-JSON / schema-invalid text", () => {
    expect(extractFindings("no json here")).toBeNull();
    expect(extractFindings('{"kind":"business"}')).toBeNull();
  });
});

describe("GatherFindingSchema · every finding must carry a real source (plan Task 12)", () => {
  it("accepts a non-empty source (file path / URL / ticket id / \"notes\")", () => {
    for (const source of ["src/index.ts", "https://example.com/pricing", "JIRA-123", "notes"]) {
      expect(() => GatherFindingSchema.parse({ label: "L", value: "V", source })).not.toThrow();
    }
  });

  it("rejects a blank/empty source — a finding is not real provenance without one", () => {
    expect(() => GatherFindingSchema.parse({ label: "L", value: "V", source: "" })).toThrow();
  });
});
