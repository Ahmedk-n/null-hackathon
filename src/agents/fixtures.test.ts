import { describe, it, expect } from "vitest";
import { FIXTURES } from "./fixtures";
import { GatherFindingsSchema } from "./schemas";
import type { GatherKind } from "./types";

const KINDS: GatherKind[] = ["technical", "business", "temporal"];

describe("agent fixtures", () => {
  for (const kind of KINDS) {
    it(`${kind}: done.findings validates, has >=3 findings, non-empty summary`, () => {
      const fx = FIXTURES[kind];
      const done = fx.events.find((e) => e.type === "done");
      expect(done).toBeTruthy();
      if (!done || done.type !== "done") throw new Error("missing terminal done event");

      expect(() => GatherFindingsSchema.parse(done.findings)).not.toThrow();
      expect(done.source).toBe("fixture");
      expect(done.findings.kind).toBe(kind);
      expect(done.findings.facts.length).toBeGreaterThanOrEqual(3);
      expect(done.findings.summary.length).toBeGreaterThan(0);

      // The terminal event resolves to the same findings the fixture exposes.
      expect(done.findings).toBe(fx.findings);
      expect(fx.findings.facts.length).toBeGreaterThanOrEqual(3);

      // Every finding carries provenance.
      for (const f of fx.findings.facts) {
        expect(f.source.length).toBeGreaterThan(0);
        expect(f.label.length).toBeGreaterThan(0);
      }
    });
  }
});
