// P2-T6/T14 · POST /api/account/delete — delete the signed-in user's auth.users row, which cascades
// to profiles/decisions/connections/runs (all FK `on delete cascade`, supabase/migrations/0001_init.sql).
// @/lib/supabase/admin is server-only (used here + gather/connections-test routes + runs.ts) and
// must never be client-imported (enforced by the boundary guard). Identifies the caller via the
// RLS-bound server client first (never trusts a
// client-supplied user id), then uses the admin/service client to perform the privileged delete.
// Unauthed → 401; never a 500 (catch → clean error json).
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createAdminSupabase();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed to delete account" }, { status: 500 });
  }
}
