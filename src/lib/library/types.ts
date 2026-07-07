// V5-4 / P2-T4 · DECISION LIBRARY — shared types for the local + remote backends.
//
// Pure types module: no react, no server imports, no wall-clock/randomness. Moved verbatim out of
// the original src/lib/library.ts so both src/lib/library/local.ts (guest) and
// src/lib/library/remote.ts (Supabase-backed) share one shape, and the public re-export surface
// (src/lib/library.ts → src/lib/library/index.ts) is unchanged for existing callers.
import type { Graph } from "@/engine";
import type { CompanyContext, ContextInput, DecisionContextPack, ScenarioId } from "@/context";

// The analysis mode a snapshot was taken in — mirrors ContextMode (pinned scenario or live custom).
export type LibraryMode = ScenarioId | "custom";

// The verdict SUMMARY persisted with a snapshot (not the full engine state — that is re-derived
// from `graph` on restore). `loadApplied` records whether the snapshot captured a stressed verdict.
export interface LibraryVerdict {
  integrity: number;
  keystoneId: string | null;
  failedIds: string[];
  loadApplied: boolean;
}

export interface LibraryEntry {
  id: string;
  title: string;
  /** ISO-8601, always the server-passed startedAt — never a client wall-clock read. */
  savedAtISO: string;
  /** Monotonic ordering key. Sort desc = newest first. */
  seq: number;
  mode: LibraryMode;
  input: ContextInput;
  companyContext: CompanyContext | null;
  pack: DecisionContextPack | null;
  graph: Graph;
  verdict: LibraryVerdict;
  /** Remote-only: whether a share link (/d/<id>) is live. Always false for guest/local entries. */
  isPublic?: boolean;
}

// The fields a caller supplies to save a new snapshot; id + seq are assigned by the backend.
export interface NewLibraryEntry {
  title: string;
  savedAtISO: string;
  mode: LibraryMode;
  input: ContextInput;
  companyContext: CompanyContext | null;
  pack: DecisionContextPack | null;
  graph: Graph;
  verdict: LibraryVerdict;
}
