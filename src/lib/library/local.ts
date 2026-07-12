// V5-4 / P2-T4 · DECISION LIBRARY — the localStorage (guest) persistence backend.
//
// Pure client module: NO react, NO server imports, and — critically — NO wall-clock and NO
// randomness (T8). Every timestamp comes from the caller (the server-passed `startedAt`); every
// id and every ordering key comes from a monotonic `counter` persisted alongside the entries, so
// ordering is stable across sessions without ever reading the wall clock or a random source.
//
// SSR-SAFE: every function no-ops (or returns []/null) when `window` is undefined, so importing it
// from a server-rendered component never throws. STORAGE-TOLERANT: every read is wrapped in
// try/catch and each entry is schema-validated per-entry — a corrupted entry (or corrupted blob)
// is skipped, never thrown.
//
// Moved verbatim (renamed local*) from the original src/lib/library.ts — see src/lib/library/index.ts
// for the resolver that picks this backend in guest mode.
import type { LibraryEntry, LibraryVerdict, NewLibraryEntry } from "./types";

const KEY = "keystone.library.v1";
const CAP = 20;

interface LibraryStore {
  counter: number;
  entries: LibraryEntry[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// Deterministic slug from a human title (no randomness). Lowercase, non-alphanumerics → single
// dashes, trimmed, capped; empty/symbol-only titles fall back to "decision".
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "decision";
}

// Per-entry schema tolerance: return a normalised LibraryEntry, or null if the record is missing
// the load-bearing fields. Optional fields are defaulted so a partially-written entry still opens.
function validateEntry(raw: unknown): LibraryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;
  if (typeof o.savedAtISO !== "string" || typeof o.seq !== "number") return null;
  if (typeof o.mode !== "string") return null;
  const g = o.graph as { nodes?: unknown; thesisId?: unknown } | null | undefined;
  if (!g || !Array.isArray(g.nodes) || typeof g.thesisId !== "string") return null;
  const v = (o.verdict ?? {}) as Record<string, unknown>;
  if (typeof v.integrity !== "number") return null;
  return {
    id: o.id,
    title: o.title,
    savedAtISO: o.savedAtISO,
    seq: o.seq,
    mode: o.mode as LibraryEntry["mode"],
    input: (o.input ?? {}) as LibraryEntry["input"],
    companyContext: (o.companyContext ?? null) as LibraryEntry["companyContext"],
    pack: (o.pack ?? null) as LibraryEntry["pack"],
    graph: o.graph as LibraryEntry["graph"],
    verdict: {
      integrity: v.integrity,
      keystoneId: typeof v.keystoneId === "string" ? v.keystoneId : null,
      failedIds: Array.isArray(v.failedIds)
        ? (v.failedIds.filter((x) => typeof x === "string") as string[])
        : [],
      loadApplied: v.loadApplied === true,
    },
    predictedPHold: typeof o.predictedPHold === "number" ? o.predictedPHold : null,
  };
}

function readStore(): LibraryStore {
  if (!isBrowser()) return { counter: 0, entries: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { counter: 0, entries: [] };
    const parsed = JSON.parse(raw) as { counter?: unknown; entries?: unknown };
    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const entries: LibraryEntry[] = [];
    for (const e of rawEntries) {
      const valid = validateEntry(e);
      if (valid) entries.push(valid); // corrupted entry → skipped, never throws
    }
    // Keep the counter monotonic even if the stored value was corrupted below the max live seq.
    const maxSeq = entries.reduce((m, e) => Math.max(m, e.seq), 0);
    const counter = typeof parsed.counter === "number" ? parsed.counter : 0;
    return { counter: Math.max(counter, maxSeq), entries };
  } catch {
    // Corrupted blob (bad JSON, wrong type) → start empty rather than crash the UI.
    return { counter: 0, entries: [] };
  }
}

function writeStore(store: LibraryStore): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota / serialization failure — persistence is best-effort, never fatal.
  }
}

// Save a new snapshot. Returns the created entry (so the caller can track currentEntryId), or
// null when off-browser. seq/id come from the persisted monotonic counter; the list is kept
// newest-first and capped at 20 (FIFO — the oldest / lowest-seq tail is dropped).
export function localSave(input: NewLibraryEntry): LibraryEntry | null {
  if (!isBrowser()) return null;
  const store = readStore();
  const seq = store.counter + 1;
  const title = input.title.trim() || "Untitled decision";
  const entry: LibraryEntry = {
    id: `${slugify(title)}-${seq}`,
    title,
    savedAtISO: input.savedAtISO,
    seq,
    mode: input.mode,
    input: input.input,
    companyContext: input.companyContext,
    pack: input.pack,
    graph: input.graph,
    verdict: input.verdict,
    predictedPHold: input.predictedPHold ?? null,
  };
  const entries = [entry, ...store.entries].sort((a, b) => b.seq - a.seq).slice(0, CAP);
  writeStore({ counter: seq, entries });
  return entry;
}

// All entries, newest first (seq desc). [] off-browser or when empty/corrupted.
export function localList(): LibraryEntry[] {
  return readStore().entries.sort((a, b) => b.seq - a.seq);
}

export function localGet(id: string): LibraryEntry | null {
  return readStore().entries.find((e) => e.id === id) ?? null;
}

export function localDelete(id: string): void {
  if (!isBrowser()) return;
  const store = readStore();
  writeStore({ counter: store.counter, entries: store.entries.filter((e) => e.id !== id) });
}

// Clone an entry as a fresh snapshot (new seq/id). Reuses the source's savedAtISO so no wall-clock
// read is needed. Returns the new entry, or null if the source is gone / off-browser.
export function localDuplicate(id: string): LibraryEntry | null {
  if (!isBrowser()) return null;
  const source = localGet(id);
  if (!source) return null;
  return localSave({
    title: `${source.title} (copy)`,
    savedAtISO: source.savedAtISO,
    mode: source.mode,
    input: source.input,
    companyContext: source.companyContext,
    pack: source.pack,
    graph: source.graph,
    verdict: source.verdict,
    predictedPHold: source.predictedPHold ?? null,
  });
}

// Patch just the verdict summary of an existing entry (Apply Load / Reinforce update the snapshot's
// verdict in place — the graph and inputs are unchanged). No-op if the entry is gone / off-browser.
export function localUpdateVerdict(id: string, verdict: LibraryVerdict): void {
  if (!isBrowser()) return;
  const store = readStore();
  const entries = store.entries.map((e) => (e.id === id ? { ...e, verdict } : e));
  writeStore({ counter: store.counter, entries });
}

// Guest → account import helper (T4/T6): every locally-saved entry, for a one-time "import guest
// library into account" offer on first login. Pure read, no side effects.
export function localAll(): LibraryEntry[] {
  return localList();
}
