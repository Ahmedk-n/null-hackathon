// GET /api/connections — list the authed user's connections (secret-omitting
// `connections_public` view; RLS scopes rows to the caller). POST — create a
// connection; `secret` is write-only (accepted here, never returned — the
// insert's `.select()` explicitly omits it). Unauthed -> 401. Never 500.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { CONNECTION_KINDS, isConnectionKind } from "@/lib/mcp/kinds";
import type { ConnectionPublic } from "@/lib/supabase/types";

const PUBLIC_COLUMNS = "id, user_id, kind, name, url, status, last_used_at, created_at";

export async function GET(): Promise<Response> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("connections_public")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ connections: [], error: error.message });
    }
    return NextResponse.json({ connections: (data ?? []) as ConnectionPublic[] });
  } catch (err) {
    // Never 500 — a broken/unreachable Supabase project degrades to an honest error.
    return NextResponse.json({
      connections: [],
      error: err instanceof Error ? err.message : "failed to list connections",
    });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | { kind?: unknown; name?: unknown; url?: unknown; secret?: unknown }
      | null;
    if (!body) {
      return NextResponse.json({ error: "invalid request body" }, { status: 400 });
    }

    const kind = isConnectionKind(body.kind) ? body.kind : "custom";
    const preset = CONNECTION_KINDS[kind];
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : preset.label;
    const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : preset.url;
    const secret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : null;

    if (!url) {
      return NextResponse.json({ error: "url is required for this kind" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("connections")
      .insert({ user_id: user.id, kind, name, url, secret, status: "untested" })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message });
    }
    return NextResponse.json({ connection: data as ConnectionPublic }, { status: 201 });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "failed to create connection",
    });
  }
}
