import { describe, it, expect } from "vitest";
import type { LibraryEntry } from "./library";
import type { Graph } from "@/engine";
import {
  buildSkyline,
  crackFoundation,
  labelSimilarity,
  tokenizeLabel,
  sampleSkylineEntries,
  MATCH_THRESHOLD,
} from "./skyline";

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Minimal well-formed entry builder. Every graph is a thesis ← AND(assumptions...) so that
// knocking any assumption to 0 zeroes the thesis (deterministic, easy to pin).
function entry(id: string, assumptions: { id: string; label: string; confidence?: number }[]): LibraryEntry {
  const graph: Graph = {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: `${id} thesis`, confidence: 1, groups: [{ kind: "AND", childIds: assumptions.map((a) => a.id) }] },
      ...assumptions.map((a) => ({ id: a.id, type: "assumption" as const, label: a.label, confidence: a.confidence ?? 0.9, groups: [] })),
    ],
  };
  return {
    id,
    title: `${id} title`,
    savedAtISO: "2026-07-04T00:00:00.000Z",
    seq: 1,
    mode: "custom",
    input: {} as LibraryEntry["input"],
    companyContext: null,
    pack: null,
    graph,
    verdict: { integrity: 0, keystoneId: null, failedIds: [], loadApplied: false },
  };
}

// ── Token matcher table ──────────────────────────────────────────────────────

describe("labelSimilarity — token-set Jaccard matcher", () => {
  it("tokenizes: lowercases, strips punctuation, drops stopwords", () => {
    expect([...tokenizeLabel("The team has SPARE capacity!")].sort()).toEqual(["capacity", "spare", "team"]);
    expect(tokenizeLabel("").size).toBe(0);
    expect(tokenizeLabel("the a of to and").size).toBe(0); // pure stopwords → empty
  });

  const cases: { a: string; b: string; matches: boolean; note: string }[] = [
    { a: "Six-person team has spare capacity", b: "Team has spare capacity to execute", matches: true, note: "near-identical → match" },
    { a: "Six-person team has spare capacity", b: "The team has spare capacity now", matches: true, note: "punctuation/stopword variants → match" },
    { a: "Enough observability for distributed ops", b: "Services have clean boundaries", matches: false, note: "unrelated → no match" },
    { a: "Budget approved for two SRE hires", b: "On-call rotation is viable", matches: false, note: "unrelated → no match" },
    { a: "team has spare capacity", b: "team has spare capacity", matches: true, note: "identical → 1.0" },
  ];
  for (const c of cases) {
    it(`${c.note}: "${c.a}" ~ "${c.b}"`, () => {
      const sim = labelSimilarity(c.a, c.b);
      expect(sim >= MATCH_THRESHOLD).toBe(c.matches);
    });
  }

  it("two empty/stopword-only labels never match", () => {
    expect(labelSimilarity("the of", "a to")).toBe(0);
  });
});

// ── buildSkyline: matching across / within entries ────────────────────────────

describe("buildSkyline — shared foundations", () => {
  it("clusters near-identical assumptions across DIFFERENT entries", () => {
    const e1 = entry("e1", [
      { id: "n1", label: "Six-person team has spare capacity" },
      { id: "n2", label: "Budget is approved" },
    ]);
    const e2 = entry("e2", [
      { id: "m1", label: "Team has spare capacity to execute" },
      { id: "m2", label: "Market timing is right" },
    ]);
    const { buildings, foundations } = buildSkyline([e1, e2]);
    expect(buildings.map((b) => b.entryId)).toEqual(["e1", "e2"]);
    expect(foundations).toHaveLength(1);
    expect(foundations[0].count).toBe(2);
    expect(foundations[0].members.map((m) => m.nodeId).sort()).toEqual(["m1", "n1"]);
    // Representative = shortest member label (tie on length → lexicographically smallest).
    expect(foundations[0].label).toBe("Six-person team has spare capacity");
  });

  it("unrelated assumptions do NOT form a foundation", () => {
    const e1 = entry("e1", [{ id: "n1", label: "Observability is adequate" }]);
    const e2 = entry("e2", [{ id: "m1", label: "Pricing beats competitors" }]);
    expect(buildSkyline([e1, e2]).foundations).toHaveLength(0);
  });

  it("same-entry duplicate assumptions do NOT form a foundation", () => {
    const e1 = entry("e1", [
      { id: "n1", label: "Six-person team has spare capacity" },
      { id: "n2", label: "Team has spare capacity to execute" }, // matches n1 but SAME entry
    ]);
    const e2 = entry("e2", [{ id: "m1", label: "Pricing beats competitors" }]);
    // The n1~n2 cluster spans only one entry → dropped.
    expect(buildSkyline([e1, e2]).foundations).toHaveLength(0);
  });

  it("is deterministic across input orderings (stable ids + ordering)", () => {
    const e1 = entry("e1", [{ id: "n1", label: "Six-person team has spare capacity" }]);
    const e2 = entry("e2", [{ id: "m1", label: "Team has spare capacity to execute" }]);
    const a = buildSkyline([e1, e2]).foundations;
    const b = buildSkyline([e1, e2]).foundations;
    expect(a).toEqual(b);
    expect(a[0].id).toBe("foundation-0");
  });

  it("skips a corrupted entry without throwing", () => {
    const good = entry("good", [{ id: "n1", label: "Six-person team has spare capacity" }]);
    const dangling: LibraryEntry = {
      ...entry("bad", [{ id: "x", label: "whatever" }]),
      id: "bad",
      graph: { thesisId: "T", nodes: [{ id: "T", type: "thesis", label: "t", confidence: 1, groups: [{ kind: "AND", childIds: ["missing"] }] }] },
    };
    const notAGraph = { ...entry("nope", [{ id: "z", label: "z" }]), id: "nope", graph: null as unknown as Graph };
    const sky = buildSkyline([good, dangling, notAGraph]);
    expect(sky.buildings.map((b) => b.entryId)).toEqual(["good"]); // only the valid one
  });
});

// ── Seeded-sample foundation + crack re-verdicts (pinned) ──────────────────────

describe("sampleSkylineEntries + crack (pinned)", () => {
  const samples = sampleSkylineEntries();

  it("seeds three samples (R / A / B) with the expected node counts", () => {
    expect(samples.map((e) => e.id)).toEqual(["sample-r", "sample-a", "sample-b"]);
    const { buildings } = buildSkyline(samples);
    expect(buildings.find((b) => b.entryId === "sample-r")!.nodeCount).toBe(13);
    expect(buildings.find((b) => b.entryId === "sample-a")!.nodeCount).toBe(13);
    expect(buildings.find((b) => b.entryId === "sample-b")!.nodeCount).toBe(9);
  });

  it("building integrities match the pinned fixture baselines", () => {
    const { buildings } = buildSkyline(samples);
    expect(buildings.find((b) => b.entryId === "sample-r")!.integrity).toBeCloseTo(55.40, 1);
    expect(buildings.find((b) => b.entryId === "sample-a")!.integrity).toBeCloseTo(61.97, 1);
    expect(buildings.find((b) => b.entryId === "sample-b")!.integrity).toBeGreaterThanOrEqual(35);
  });

  it("the aliased 'spare capacity' foundation spans R + A", () => {
    const { foundations } = buildSkyline(samples);
    expect(foundations).toHaveLength(1);
    const f = foundations[0];
    expect(f.count).toBe(2);
    expect(f.members.map((m) => `${m.entryId}:${m.nodeId}`).sort()).toEqual([
      "sample-a:k_credible",
      "sample-r:team_has_backend_capacity",
    ]);
  });

  it("cracking the foundation collapses BOTH R and A (pinned re-verdicts)", () => {
    const { foundations } = buildSkyline(samples);
    const results = crackFoundation(samples, foundations[0]);
    expect(results.map((r) => r.entryId)).toEqual(["sample-a", "sample-r"]);
    const a = results.find((r) => r.entryId === "sample-a")!;
    const r = results.find((r) => r.entryId === "sample-r")!;
    expect(a.integrityBefore).toBeCloseTo(61.97, 1);
    expect(a.integrityAfter).toBeCloseTo(0, 5);
    expect(a.failed).toBe(true);
    expect(r.integrityBefore).toBeCloseTo(55.40, 1);
    expect(r.integrityAfter).toBeCloseTo(0, 5);
    expect(r.failed).toBe(true);
    expect(results.filter((x) => x.failed)).toHaveLength(2); // "2 COLLAPSE"
  });

  it("crackFoundation skips a missing building without throwing", () => {
    const { foundations } = buildSkyline(samples);
    // Pass only R; the A member has no matching entry → one row, no throw.
    const results = crackFoundation([samples[0]], foundations[0]);
    expect(results.map((x) => x.entryId)).toEqual(["sample-r"]);
  });
});
