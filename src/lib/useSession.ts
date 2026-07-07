"use client";
// P2-T6 · the client-side session hook. Subscribes to createBrowserSupabase().auth.onAuthStateChange
// (publishable-key client ONLY — never admin/@/agents/@/llm; see the boundary test) and returns
// { user, loading }. On every auth-state change it also flips the decision-library backend
// (setLibraryBackend) so every "@/lib/library" call routes to Supabase once signed in and back to
// localStorage on sign-out — this is the ONLY place that needs to know about that switch.
//
// Guest mode must keep working offline: nothing here throws if Supabase is unreachable — a failed
// getUser()/subscribe attempt just leaves the hook in its guest default (user: null).
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { setLibraryBackend, importGuestLibraryIntoAccount } from "@/lib/library";

export interface SessionState {
  user: User | null;
  loading: boolean;
}

// Guards the one-time "import guest library into account" offer (global constraint: idempotent —
// importGuestLibraryIntoAccount also dedupes by content, this flag just avoids re-asking).
const IMPORT_FLAG_KEY = "keystone.library.imported.v1";

function alreadyImported(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(IMPORT_FLAG_KEY) === "1";
  } catch {
    return false; // storage unavailable — treat as "not yet imported" (import is best-effort)
  }
}

function markImported(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(IMPORT_FLAG_KEY, "1");
  } catch {
    // best-effort — a failed write just means the offer may run again next session
  }
}

export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    // createBrowserClient THROWS SYNCHRONOUSLY when NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are missing
    // (misconfigured deploy, or simply not set — e.g. this repo's own test environment). Guest mode
    // must keep working in that case, so the whole subscribe attempt is guarded: any failure here
    // just leaves the hook at its guest default (user: null, loading: false) rather than crashing.
    try {
      const supabase = createBrowserSupabase();

      supabase.auth
        .getUser()
        .then(({ data }) => {
          if (cancelled) return;
          setUser(data.user ?? null);
          setLibraryBackend(data.user ? "user" : "guest");
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false); // offline / no Supabase — guest mode stays usable
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        setLibraryBackend(nextUser ? "user" : "guest");
        setLoading(false);

        if (nextUser && !alreadyImported()) {
          markImported();
          void importGuestLibraryIntoAccount(); // fire-and-forget — never blocks the sign-in flow
        }
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      setLoading(false);
      setLibraryBackend("guest");
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return { user, loading };
}
