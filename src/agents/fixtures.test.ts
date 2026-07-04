import { describe, it, expect } from "vitest";
import { FIXTURES } from "./fixtures";
import { GatherFindingsSchema } from "./schemas";
import type { GatherKind } from "./types";

const KINDS: GatherKind[] = ["technical", "business", "temporal"];

describe("agent fixtures", () => {
  for (const kind of KINDS) {
    it(`${kind}: done.findings validates, has >=5 findings, non-empty summary`, () => {
      const fx = FIXTURES[kind];
      const done = fx.events.find((e) => e.type === "done");
      expect(done).toBeTruthy();
      if (!done || done.type !== "done") throw new Error("missing terminal done event");

      expect(() => GatherFindingsSchema.parse(done.findings)).not.toThrow();
      expect(done.source).toBe("fixture");
      expect(done.findings.kind).toBe(kind);
      // ≥5 so the fixture fallback always satisfies the extractFindings MIN_FACTS
      // guard (W3-7 / T11) — a fallback must never render a sparse ledger.
      expect(done.findings.facts.length).toBeGreaterThanOrEqual(5);
      expect(done.findings.summary.length).toBeGreaterThan(0);

      // The terminal event resolves to the same findings the fixture exposes.
      expect(done.findings).toBe(fx.findings);
      expect(fx.findings.facts.length).toBeGreaterThanOrEqual(5);

      // Every finding carries provenance.
      for (const f of fx.findings.facts) {
        expect(f.source.length).toBeGreaterThan(0);
        expect(f.label.length).toBeGreaterThan(0);
      }

      // V8-C2 · RICH TYPED DEPTH: every fixture finding reads as real, multi-layered research —
      // a category, a verbatim source excerpt, an implication tying it to the decision, and at least
      // one extracted quantity OR named entity. This is what the offline demo must SHOW.
      for (const f of fx.findings.facts) {
        expect(f.category && f.category.length).toBeGreaterThan(0);
        expect(f.sourceExcerpt && f.sourceExcerpt.length).toBeGreaterThan(0);
        expect(f.implication && f.implication.length).toBeGreaterThan(0);
        const quantities = f.quantities?.length ?? 0;
        const entities = f.entities?.length ?? 0;
        expect(quantities + entities).toBeGreaterThan(0);
      }

      // At least one finding across the fixture carries extracted quantities (numbers as data).
      expect(fx.findings.facts.some((f) => (f.quantities?.length ?? 0) > 0)).toBe(true);
    });
  }
});
