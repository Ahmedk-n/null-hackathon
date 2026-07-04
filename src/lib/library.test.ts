// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  saveEntry,
  listEntries,
  getEntry,
  deleteEntry,
  duplicateEntry,
  updateEntryVerdict,
  type NewLibraryEntry,
} from "./library";
import { createKeystoneStore, selectIntegrity, selectKeystoneId } from "@/store/useKeystone";
import { integrity, keystone } from "@/engine";
import { fixtureContextGraph } from "@/context";
import type { Graph } from "@/engine";

const KEY = "keystone.library.v1";

// A minimal valid snapshot payload. Callers override title/graph/verdict per test.
function make(overrides: Partial<NewLibraryEntry> = {}): NewLibraryEntry {
  const graph: Graph = { thesisId: "t", nodes: [{ id: "t", type: "thesis", label: "T", confidence: 0.8, groups: [] }] };
  return {
    title: "Migrate to microservices",
    savedAtISO: "2026-07-04T03:30:00Z",
    mode: "A",
    input: { businessContextText: "", technicalContextText: "", temporalContextText: "", decisionText: "d" },
    companyContext: null,
    pack: null,
    graph,
    verdict: { integrity: 62, keystoneId: "k", failedIds: [], loadApplied: false },
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("decision library — round-trip", () => {
  it("saves and lists an entry", () => {
    const saved = saveEntry(make({ title: "Alpha" }));
    expect(saved).not.toBeNull();
    expect(saved!.seq).toBe(1);
    expect(saved!.id).toBe("alpha-1");
    const all = listEntries();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Alpha");
  });

  it("gets an entry by id and round-trips the graph + verdict", () => {
    const saved = saveEntry(make({ title: "Beta", verdict: { integrity: 12, keystoneId: "x", failedIds: ["a", "b"], loadApplied: true } }))!;
    const got = getEntry(saved.id)!;
    expect(got.verdict.integrity).toBe(12);
    expect(got.verdict.failedIds).toEqual(["a", "b"]);
    expect(got.verdict.loadApplied).toBe(true);
    expect(got.graph.thesisId).toBe("t");
  });

  it("lists newest-first by seq (monotonic, not insertion echo)", () => {
    saveEntry(make({ title: "One" }));
    saveEntry(make({ title: "Two" }));
    saveEntry(make({ title: "Three" }));
    expect(listEntries().map((e) => e.title)).toEqual(["Three", "Two", "One"]);
    expect(listEntries().map((e) => e.seq)).toEqual([3, 2, 1]);
  });

  it("deletes an entry", () => {
    const a = saveEntry(make({ title: "Keep" }))!;
    const b = saveEntry(make({ title: "Drop" }))!;
    deleteEntry(b.id);
    expect(listEntries().map((e) => e.id)).toEqual([a.id]);
  });

  it("duplicates an entry with a fresh seq/id and (copy) title", () => {
    const src = saveEntry(make({ title: "Source" }))!;
    const dup = duplicateEntry(src.id)!;
    expect(dup.id).not.toBe(src.id);
    expect(dup.seq).toBe(2);
    expect(dup.title).toBe("Source (copy)");
    // Reuses the source timestamp (no wall-clock read).
    expect(dup.savedAtISO).toBe(src.savedAtISO);
    expect(listEntries()).toHaveLength(2);
  });

  it("updates only the verdict summary in place", () => {
    const e = saveEntry(make({ title: "Verdict" }))!;
    updateEntryVerdict(e.id, { integrity: 4, keystoneId: "k2", failedIds: ["z"], loadApplied: true });
    const got = getEntry(e.id)!;
    expect(got.verdict).toEqual({ integrity: 4, keystoneId: "k2", failedIds: ["z"], loadApplied: true });
    expect(got.title).toBe("Verdict"); // untouched
  });

  it("monotonic seq survives a delete of the newest (counter never rewinds)", () => {
    saveEntry(make({ title: "One" }));
    const two = saveEntry(make({ title: "Two" }))!;
    deleteEntry(two.id);
    const three = saveEntry(make({ title: "Three" }))!;
    expect(three.seq).toBe(3); // not 2 — the counter is monotonic
  });
});

describe("decision library — cap 20 FIFO", () => {
  it("keeps the 20 newest and drops the oldest", () => {
    for (let i = 1; i <= 25; i++) saveEntry(make({ title: `D${i}` }));
    const all = listEntries();
    expect(all).toHaveLength(20);
    // Newest first: seq 25 .. 6. Oldest five (1..5) evicted.
    expect(all[0].seq).toBe(25);
    expect(all[all.length - 1].seq).toBe(6);
    expect(all.some((e) => e.seq <= 5)).toBe(false);
  });
});

describe("decision library — corrupted-entry tolerance", () => {
  it("skips a corrupted entry but keeps the valid ones", () => {
    const good = { id: "good-1", title: "Good", savedAtISO: "2026-07-04T00:00:00Z", seq: 1, mode: "A", input: {}, companyContext: null, pack: null, graph: { thesisId: "t", nodes: [] }, verdict: { integrity: 50, keystoneId: null, failedIds: [], loadApplied: false } };
    const badMissingGraph = { id: "bad-2", title: "Bad", savedAtISO: "x", seq: 2, mode: "A" };
    const notAnObject = 42;
    window.localStorage.setItem(KEY, JSON.stringify({ counter: 2, entries: [good, badMissingGraph, notAnObject] }));
    const all = listEntries();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("good-1");
  });

  it("returns [] on wholly corrupt JSON, never throws", () => {
    window.localStorage.setItem(KEY, "{not valid json");
    expect(() => listEntries()).not.toThrow();
    expect(listEntries()).toEqual([]);
  });

  it("saving after corruption still works (counter recovers from live max seq)", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ counter: 0, entries: [{ id: "good-7", title: "G", savedAtISO: "x", seq: 7, mode: "A", input: {}, companyContext: null, pack: null, graph: { thesisId: "t", nodes: [] }, verdict: { integrity: 50 } }] }));
    const next = saveEntry(make({ title: "After" }))!;
    expect(next.seq).toBe(8); // max(counter=0, maxSeq=7) + 1
  });
});

describe("decision library — SSR no-op", () => {
  const realWindow = globalThis.window;
  afterEach(() => {
    vi.stubGlobal("window", realWindow);
  });

  it("no-ops / returns []/null when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(listEntries()).toEqual([]);
    expect(getEntry("x")).toBeNull();
    expect(saveEntry(make())).toBeNull();
    expect(duplicateEntry("x")).toBeNull();
    expect(() => deleteEntry("x")).not.toThrow();
    expect(() => updateEntryVerdict("x", { integrity: 0, keystoneId: null, failedIds: [], loadApplied: false })).not.toThrow();
  });
});

describe("decision library — store restore correctness", () => {
  it("a restored graph re-derives the same integrity + keystone the snapshot recorded", () => {
    // Snapshot a real fixture graph with its engine-computed verdict.
    const graph = fixtureContextGraph();
    const savedVerdict = { integrity: integrity(graph), keystoneId: keystone(graph)?.id ?? null, failedIds: [] as string[], loadApplied: false };
    const entry = saveEntry(make({ title: "Fixture", graph, verdict: savedVerdict }))!;

    // Restore into a fresh store exactly as KeystoneApp does (setGraph, no API).
    const store = createKeystoneStore();
    store.getState().setGraph(getEntry(entry.id)!.graph);

    expect(selectIntegrity(store.getState())).toBe(savedVerdict.integrity);
    expect(selectKeystoneId(store.getState())).toBe(savedVerdict.keystoneId);
  });
});

describe("T8 — no client wall-clock / randomness in library-layer client files", () => {
  const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const FORBIDDEN = /Date\.now|new Date\(|Math\.random/;
  const files = [
    "lib/library.ts",
    "landing/RecentDecisions.tsx",
    "ui/tabs/ContextTab.tsx",
    "app/KeystoneApp.tsx",
  ];
  for (const rel of files) {
    it(`${rel} contains no wall-clock / random source`, () => {
      const src = readFileSync(join(SRC_ROOT, rel), "utf8");
      expect(FORBIDDEN.test(src), `${rel} must not read the wall clock or randomness`).toBe(false);
    });
  }
});
