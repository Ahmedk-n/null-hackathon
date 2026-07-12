// P2-T5 · GET /api/decisions (list, seq desc) · POST /api/decisions (create).
// createServerSupabase() binds the request's session cookie, so every query below runs AS the
// authed user — RLS (`own decisions` policy, supabase/migrations/0001_init.sql) is the real
// ownership guard; the explicit .eq("user_id", user.id) filters are defense-in-depth. Unauthed →
// 401. Never a 500: any Supabase error is caught and returned as a clean error JSON.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rowToJSON } from "./shared";
import type { DecisionRow } from "@/lib/supabase/types";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("decisions")
      .select("*")
      .eq("user_id", user.id)
      .order("seq", { ascending: false });
    // A DB-level error is a genuine server error, not an auth failure — return it as a clean JSON
    // 500 (never let it become an uncaught exception / framework default error page).
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as DecisionRow[];
    return NextResponse.json({ entries: rows.map(rowToJSON) });
  } catch {
    return NextResponse.json({ error: "failed to list decisions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      title?: unknown;
      mode?: unknown;
      input?: unknown;
      companyContext?: unknown;
      pack?: unknown;
      graph?: unknown;
      verdict?: unknown;
      predictedPHold?: number | null;
    } | null;
    if (!body || typeof body.title !== "string" || typeof body.mode !== "string" || !body.graph || !body.verdict) {
      return NextResponse.json({ error: "invalid decision payload" }, { status: 400 });
    }

    // Compute the next seq server-side (max + 1 for this user; 1 if none yet).
    const { data: maxRow } = await supabase
      .from("decisions")
      .select("seq")
      .eq("user_id", user.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSeq = ((maxRow as { seq: number } | null)?.seq ?? 0) + 1;

    const { data, error } = await supabase
      .from("decisions")
      .insert({
        user_id: user.id,
        title: body.title,
        mode: body.mode,
        input: body.input ?? {},
        company_context: body.companyContext ?? null,
        pack: body.pack ?? null,
        graph: body.graph,
        verdict: body.verdict,
        seq: nextSeq,
        is_public: false,
        predicted_p_hold: body.predictedPHold ?? null,
      })
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "failed to save decision" }, { status: 500 });
    }
    return NextResponse.json({ entry: rowToJSON(data as DecisionRow) });
  } catch {
    return NextResponse.json({ error: "failed to save decision" }, { status: 500 });
  }
}
