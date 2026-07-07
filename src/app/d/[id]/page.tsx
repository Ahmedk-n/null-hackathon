// P2-T7 · /d/[id] — the public read-only share view. SERVER component: reads the decision
// straight off Supabase with the RLS-bound server client (no auth required for a genuinely public
// row — the migration's "public read shared" policy allows `select` where `is_public = true` for
// ANY caller, signed in or not). A row that doesn't exist, isn't public, or belongs to nobody
// (bad id) all render the SAME clean not-found state via Next's notFound() — see ./not-found.tsx.
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { DecisionRow } from "@/lib/supabase/types";
import { ShareView, type ShareDecision } from "./ShareView";

function toShareDecision(row: DecisionRow): ShareDecision {
  return {
    id: row.id,
    title: row.title,
    savedAtISO: row.created_at,
    mode: row.mode,
    input: row.input,
    companyContext: row.company_context,
    pack: row.pack,
    graph: row.graph,
    verdict: row.verdict,
  };
}

export default async function SharedDecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let row: DecisionRow | null = null;
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("decisions")
      .select("*")
      .eq("id", id)
      .eq("is_public", true)
      .maybeSingle();
    row = (data as DecisionRow | null) ?? null;
  } catch {
    row = null; // never a 500 — a lookup failure reads the same as "not found"
  }

  if (!row) notFound();

  return <ShareView decision={toShareDecision(row)} />;
}
