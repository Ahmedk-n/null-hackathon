"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser client — publishable key only. Safe to bundle. Never reads a secret.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
