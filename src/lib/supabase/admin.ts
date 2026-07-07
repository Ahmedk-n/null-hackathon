import { createClient } from "@supabase/supabase-js";

// Service client — SECRET key, bypasses RLS. NEVER import from a "use client" file.
// Use only in API routes for privileged reads (e.g. connection secrets, profile trigger backfill).
export function createAdminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
