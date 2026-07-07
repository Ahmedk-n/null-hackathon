// P2-T6 · /auth/callback — the OAuth/magic-link code exchange. Server-only (never client-imported).
// exchangeCodeForSession binds the session cookie via createServerSupabase(); any failure (missing
// code, expired code, network) just falls through to a redirect at "/" — the user lands signed out
// rather than seeing a crash, and can retry from /login.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const supabase = await createServerSupabase();
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      // Fall through — the user ends up signed out at "/" and can retry from /login.
    }
  }
  return NextResponse.redirect(new URL("/", req.url));
}
