import { describe, it, expect, beforeEach } from "vitest";
import { gather } from "./index";
import { GatherFindingsSchema } from "./schemas";
import type { AgentEvent, GatherKind, GatherSource } from "./types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

const CASES: { kind: GatherKind; source: GatherSource }[] = [
  { kind: "technical", source: {} },
  { kind: "business", source: {} },
  { kind: "temporal", source: { notes: "" } },
];

const FIXED_TS = "2026-07-03T00:00:00Z";

describe("gather (offline: fixture fallback)", () => {
  for (const { kind, source } of CASES) {
    it(`${kind}: resolves schema-valid findings, emits status + terminal done, never throws`, async () => {
      const events: AgentEvent[] = [];
      const findings = await gather(kind, source, (e) => events.push(e), () => FIXED_TS);

      expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
      expect(findings.kind).toBe(kind);

      expect(events.some((e) => e.type === "status")).toBe(true);

      const last = events[events.length - 1];
      expect(last.type).toBe("done");
      if (last.type === "done") {
        expect(last.source).toBe("fixture");
        expect(() => GatherFindingsSchema.parse(last.findings)).not.toThrow();
      }

      // Every event's ts is stamped by the supplied clock.
      expect(events.every((e) => e.ts === FIXED_TS)).toBe(true);
    });
  }
});
