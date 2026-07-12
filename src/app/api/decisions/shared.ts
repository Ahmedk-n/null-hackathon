// P2-T5 · shared helpers for /api/decisions + /api/decisions/[id]. Server-only (no "use client"),
// so a plain `new Date()` here is fine (T8 forbids wall-clock reads only in client-bundle files).
import type { DecisionRow } from "@/lib/supabase/types";

// The JSON shape both routes return — matches LibraryEntry (src/lib/library/types.ts) plus
// isPublic, so src/lib/library/remote.ts can hand the parsed body straight back to callers.
export interface DecisionJSON {
  id: string;
  title: string;
  savedAtISO: string;
  seq: number;
  mode: string;
  input: unknown;
  companyContext: unknown;
  pack: unknown;
  graph: unknown;
  verdict: unknown;
  isPublic: boolean;
  // Phase 2 · cross-decision calibration (Task 1 writes predictedPHold only; the rest land Task 2).
  predictedPHold: number | null;
  outcome: "held" | "failed" | null;
  resolvedAtISO: string | null;
  materializedCategories: string[] | null;
}

export function rowToJSON(row: DecisionRow): DecisionJSON {
  return {
    id: row.id,
    title: row.title,
    savedAtISO: row.created_at,
    seq: row.seq,
    mode: row.mode,
    input: row.input,
    companyContext: row.company_context,
    pack: row.pack,
    graph: row.graph,
    verdict: row.verdict,
    isPublic: row.is_public,
    predictedPHold: row.predicted_p_hold ?? null,
    outcome: row.outcome ?? null,
    resolvedAtISO: row.resolved_at ?? null,
    materializedCategories: row.materialized_categories ?? null,
  };
}

export function nowISO(): string {
  return new Date().toISOString();
}
