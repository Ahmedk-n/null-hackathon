// P2-T4 · DECISION LIBRARY — the Supabase-backed (signed-in) persistence backend.
//
// Same surface shape as local.ts (rename local* → remote*), backed by fetch calls to
// /api/decisions (RLS-scoped server routes — see src/app/api/decisions/**). Every function is
// async (fetch is inherently async) and NEVER throws: a network error / non-OK response degrades
// to []/null (reads) or a silent no-op (writes) so the UI never crashes when the connection to
// Supabase is flaky — see src/lib/library/index.ts for the guest/user resolver that picks this
// backend once a session exists.
import type { LibraryEntry, LibraryVerdict, NewLibraryEntry } from "./types";

const BASE = "/api/decisions";

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function remoteSave(input: NewLibraryEntry): Promise<LibraryEntry | null> {
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const body = await safeJson<{ entry: LibraryEntry }>(res);
    return body?.entry ?? null;
  } catch {
    return null; // offline / network failure — never throw, caller stays usable
  }
}

export async function remoteList(): Promise<LibraryEntry[]> {
  try {
    const res = await fetch(BASE, { method: "GET" });
    if (!res.ok) return [];
    const body = await safeJson<{ entries: LibraryEntry[] }>(res);
    return body?.entries ?? [];
  } catch {
    return [];
  }
}

export async function remoteGet(id: string): Promise<LibraryEntry | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "GET" });
    if (!res.ok) return null;
    const body = await safeJson<{ entry: LibraryEntry }>(res);
    return body?.entry ?? null;
  } catch {
    return null;
  }
}

export async function remoteDelete(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // best-effort — the UI already optimistically dropped the row
  }
}

// No dedicated duplicate endpoint (Task 5 exposes GET/POST/PATCH/DELETE only) — read the source,
// then re-save it as a fresh row with a "(copy)" title, mirroring local.ts's behaviour exactly.
export async function remoteDuplicate(id: string): Promise<LibraryEntry | null> {
  const source = await remoteGet(id);
  if (!source) return null;
  return remoteSave({
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

export async function remoteUpdateVerdict(id: string, verdict: LibraryVerdict): Promise<void> {
  try {
    await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict }),
    });
  } catch {
    // best-effort — the local session state already reflects the new verdict
  }
}

// Toggle the share link (Task 7). Not part of the local*/index* six-fn surface (guest mode has no
// share link — /d/<id> only reads Supabase), so it is exported here directly and consumed by the
// saved-decision UI's Share toggle.
export async function remoteSetPublic(id: string, isPublic: boolean): Promise<LibraryEntry | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isPublic }),
    });
    if (!res.ok) return null;
    const body = await safeJson<{ entry: LibraryEntry }>(res);
    return body?.entry ?? null;
  } catch {
    return null;
  }
}

// Phase 2 · cross-decision calibration (Task 2). Records the real-world outcome of a decision
// (did the keystone assumption hold or fail?) plus which risk categories materialized. Guest mode
// has no calibration story yet (no server to score against), so — like remoteSetPublic — this is
// exported directly rather than folded into the guest/user index.ts resolver. Server stamps
// `resolved_at` on the PATCH; never throw (fetch-only, no server imports, no wall-clock reads).
export async function resolveOutcome(
  id: string,
  outcome: "held" | "failed",
  materializedCategories?: string[],
): Promise<LibraryEntry | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome, materializedCategories }),
    });
    if (!res.ok) return null;
    const body = await safeJson<{ entry: LibraryEntry }>(res);
    return body?.entry ?? null;
  } catch {
    return null;
  }
}
