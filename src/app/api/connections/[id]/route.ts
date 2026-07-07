// PATCH/DELETE /api/connections/[id] — authed, RLS-scoped to the owning user.
// `secret` is write-only: accepted on PATCH, never returned (the update's
// `.select()` explicitly omits it). Unauthed -> 401. Never 500.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ConnectionPublic } from "@/lib/supabase/types";

const PUBLIC_COLUMNS = "id, user_id, kind, name, url, status, last_used_at, created_at";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | { name?: unknown; url?: unknown; secret?: unknown; status?: unknown }
      | null;
    if (!body) {
      return NextResponse.json({ error: "invalid request body" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.url === "string" && body.url.trim()) patch.url = body.url.trim();
    if (typeof body.secret === "string") patch.secret = body.secret.trim() || null;
    if (body.status === "untested" || body.status === "ok" || body.status === "error") {
      patch.status = body.status;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no updatable fields provided" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("connections")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id) // defense-in-depth alongside RLS (match decisions routes)
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message });
    }
    return NextResponse.json({ connection: data as ConnectionPublic });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "failed to update connection",
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { error, count } = await supabase
      .from("connections")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id); // defense-in-depth alongside RLS
    if (error) {
      return NextResponse.json({ ok: false, error: error.message });
    }
    if (count === 0) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "failed to delete connection",
    });
  }
}
