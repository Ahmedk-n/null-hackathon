// @vitest-environment jsdom
// P2-T4 · the guest/user backend resolver. Guest mode round-trips through local.ts (localStorage);
// switching to "user" mode routes every call through remote.ts (fetch to /api/decisions), verified
// here against a mocked global.fetch so no network/Supabase is required.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveEntry,
  listEntries,
  getEntry,
  deleteEntry,
  duplicateEntry,
  updateEntryVerdict,
  setLibraryBackend,
  getLibraryBackend,
  importGuestLibraryIntoAccount,
  type LibraryEntry,
  type NewLibraryEntry,
} from "./index";

function make(overrides: Partial<NewLibraryEntry> = {}): NewLibraryEntry {
  return {
    title: "Migrate to microservices",
    savedAtISO: "2026-07-04T03:30:00Z",
    mode: "A",
    input: { businessContextText: "", technicalContextText: "", temporalContextText: "", decisionText: "d" },
    companyContext: null,
    pack: null,
    graph: { thesisId: "t", nodes: [{ id: "t", type: "thesis", label: "T", confidence: 0.8, groups: [] }] },
    verdict: { integrity: 62, keystoneId: "k", failedIds: [], loadApplied: false },
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  setLibraryBackend("guest");
  vi.unstubAllGlobals();
});

describe("library resolver — guest mode (default)", () => {
  it("defaults to guest and round-trips through local storage", async () => {
    expect(getLibraryBackend()).toBe("guest");
    const saved = await saveEntry(make({ title: "Guest entry" }));
    expect(saved).not.toBeNull();
    const all = await listEntries();
    expect(all.map((e) => e.title)).toEqual(["Guest entry"]);
    const got = await getEntry(saved!.id);
    expect(got?.title).toBe("Guest entry");
    await updateEntryVerdict(saved!.id, { integrity: 5, keystoneId: null, failedIds: [], loadApplied: true });
    expect((await getEntry(saved!.id))?.verdict.integrity).toBe(5);
    const dup = await duplicateEntry(saved!.id);
    expect(dup?.title).toBe("Guest entry (copy)");
    await deleteEntry(saved!.id);
    expect((await listEntries()).map((e) => e.id)).toEqual([dup!.id]);
  });
});

describe("library resolver — user mode (routes to /api/decisions)", () => {
  it("saveEntry POSTs to /api/decisions and returns the server row", async () => {
    setLibraryBackend("user");
    const entry: LibraryEntry = { ...make(), id: "d-1", seq: 1, isPublic: false };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/decisions");
      expect(init?.method).toBe("POST");
      return new Response(JSON.stringify({ entry }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveEntry(make({ title: entry.title }));
    expect(saved).toEqual(entry);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("listEntries GETs /api/decisions and unwraps {entries}", async () => {
    setLibraryBackend("user");
    const rows: LibraryEntry[] = [{ ...make(), id: "d-2", seq: 2 }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ entries: rows }), { status: 200 })),
    );
    expect(await listEntries()).toEqual(rows);
  });

  it("a network failure degrades to []/null, never throws", async () => {
    setLibraryBackend("user");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(listEntries()).resolves.toEqual([]);
    await expect(getEntry("x")).resolves.toBeNull();
    await expect(saveEntry(make())).resolves.toBeNull();
    await expect(deleteEntry("x")).resolves.toBeUndefined();
  });

  it("a non-OK response degrades to []/null, never throws", async () => {
    setLibraryBackend("user");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
    );
    expect(await listEntries()).toEqual([]);
    expect(await getEntry("x")).toBeNull();
  });

  it("duplicateEntry falls back to GET + POST (no dedicated endpoint)", async () => {
    setLibraryBackend("user");
    const source: LibraryEntry = { ...make(), id: "d-3", seq: 3 };
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if ((init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify({ entry: source }), { status: 200 });
        }
        const dup = { ...source, id: "d-4", title: `${source.title} (copy)` };
        return new Response(JSON.stringify({ entry: dup }), { status: 200 });
      }),
    );
    const dup = await duplicateEntry(source.id);
    expect(dup?.title).toBe(`${source.title} (copy)`);
    expect(calls[0]).toMatch(/^GET \/api\/decisions\/d-3$/);
    expect(calls[1]).toMatch(/^POST \/api\/decisions$/);
  });
});

describe("library resolver — importGuestLibraryIntoAccount", () => {
  it("pushes every local entry to remote via saveEntry, counting successes", async () => {
    setLibraryBackend("guest");
    await saveEntry(make({ title: "One" }));
    await saveEntry(make({ title: "Two" }));

    const posted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { title: string };
        posted.push(body.title);
        return new Response(
          JSON.stringify({ entry: { ...make(), id: `remote-${posted.length}`, seq: posted.length } }),
          { status: 200 },
        );
      }),
    );

    const result = await importGuestLibraryIntoAccount();
    expect(result.imported).toBe(2);
    expect(posted.sort()).toEqual(["One", "Two"]);
  });
});
