// P2-T5 · GET/PATCH/DELETE /api/decisions/[id] — a single owned decision. Next 15 route params are
// async. createServerSupabase() binds the session cookie so every query runs AS the authed user;
// RLS is the real ownership guard, the .eq("user_id", user.id) filters are defense-in-depth.
// Unauthed → 401; not found / not owned → 404; never a 500 (catch → clean error json).
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rowToJSON, nowISO } from "../shared";
import { PatchBody } from "./patch-schema";
import type { DecisionRow } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("decisions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry: rowToJSON(data as DecisionRow) });
  } catch {
    return NextResponse.json({ error: "failed to load decision" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid patch body" }, { status: 400 });
    }
    const body = parsed.data;
    const patch: Record<string, unknown> = { updated_at: nowISO() };
    if (body.verdict !== undefined) patch.verdict = body.verdict;
    if (body.isPublic !== undefined) patch.is_public = body.isPublic;
    if (body.outcome !== undefined) {
      patch.outcome = body.outcome;
      patch.materialized_categories = body.materializedCategories ?? null;
      patch.resolved_at = nowISO();
    }

    const { data, error } = await supabase
      .from("decisions")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry: rowToJSON(data as DecisionRow) });
  } catch {
    return NextResponse.json({ error: "failed to update decision" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { error } = await supabase.from("decisions").delete().eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed to delete decision" }, { status: 500 });
  }
}
