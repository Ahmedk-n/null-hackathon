// P2-T4 · DECISION LIBRARY — the public surface, unchanged names, resolved to a backend by auth
// state. `saveEntry/listEntries/getEntry/deleteEntry/updateEntryVerdict/duplicateEntry` are the
// SAME six names every existing caller already imports from "@/lib/library" (which now just
// re-exports this module) — only their signature moved from sync to Promise-returning, so a
// backend switch (guest ↔ signed-in) never needs a second code path in the caller.
//
// setLibraryBackend("guest" | "user") is called by src/lib/useSession.ts on every auth-state
// change; nothing else needs to touch `mode`. Guest routes to local.ts (wrapped in
// Promise.resolve so the surface stays uniformly async); signed-in routes to remote.ts (fetch to
// /api/decisions, RLS-scoped). Both backends already degrade honestly on their own (local no-ops
// off-browser; remote never throws on a network error), so the resolver adds no new failure mode.
import * as local from "./local";
import * as remote from "./remote";
import type { LibraryEntry, LibraryVerdict, NewLibraryEntry } from "./types";

export type { LibraryEntry, LibraryVerdict, NewLibraryEntry, LibraryMode } from "./types";
export { remoteSetPublic } from "./remote";

export type LibraryBackend = "guest" | "user";

let mode: LibraryBackend = "guest";

// Called by useSession on every auth-state change (signed in → "user", signed out → "guest").
// Also callable directly (tests, KeystoneApp) — see src/lib/useSession.ts.
export function setLibraryBackend(next: LibraryBackend): void {
  mode = next;
}

export function getLibraryBackend(): LibraryBackend {
  return mode;
}

export function saveEntry(input: NewLibraryEntry): Promise<LibraryEntry | null> {
  return mode === "guest" ? Promise.resolve(local.localSave(input)) : remote.remoteSave(input);
}

export function listEntries(): Promise<LibraryEntry[]> {
  return mode === "guest" ? Promise.resolve(local.localList()) : remote.remoteList();
}

export function getEntry(id: string): Promise<LibraryEntry | null> {
  return mode === "guest" ? Promise.resolve(local.localGet(id)) : remote.remoteGet(id);
}

export function deleteEntry(id: string): Promise<void> {
  return mode === "guest" ? Promise.resolve(local.localDelete(id)) : remote.remoteDelete(id);
}

export function duplicateEntry(id: string): Promise<LibraryEntry | null> {
  return mode === "guest" ? Promise.resolve(local.localDuplicate(id)) : remote.remoteDuplicate(id);
}

export function updateEntryVerdict(id: string, verdict: LibraryVerdict): Promise<void> {
  return mode === "guest"
    ? Promise.resolve(local.localUpdateVerdict(id, verdict))
    : remote.remoteUpdateVerdict(id, verdict);
}

// One-time "import guest library into account" (global constraint): every locally-saved entry,
// pushed to the remote backend regardless of the CURRENT `mode` (so it can run once right after
// sign-in, before/while the switch to "user" takes effect). Idempotent BY CONTENT: it first reads
// the account's existing remote entries and skips any local entry that already has a match there
// (by title + savedAtISO — the pair that uniquely identifies a saved snapshot's provenance), so
// calling this twice (e.g. a retried offer, or the user signing in on a second browser that also
// has guest data) never duplicates rows. The caller (useSession) additionally gates the *offer*
// on a per-browser flag so the user is only ever asked once.
export async function importGuestLibraryIntoAccount(): Promise<{ imported: number; skipped: number }> {
  const [entries, existing] = await Promise.all([Promise.resolve(local.localAll()), remote.remoteList()]);
  const existingKeys = new Set(existing.map((e) => `${e.title}||${e.savedAtISO}`));
  let imported = 0;
  let skipped = 0;
  for (const e of entries) {
    if (existingKeys.has(`${e.title}||${e.savedAtISO}`)) {
      skipped++;
      continue;
    }
    const saved = await remote.remoteSave({
      title: e.title,
      savedAtISO: e.savedAtISO,
      mode: e.mode,
      input: e.input,
      companyContext: e.companyContext,
      pack: e.pack,
      graph: e.graph,
      verdict: e.verdict,
    });
    if (saved) imported++;
  }
  return { imported, skipped };
}
