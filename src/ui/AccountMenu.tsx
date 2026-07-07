"use client";
// P2-T6 · the TopBar account widget. Three states: LOADING (session resolving), GUEST ("Sign in to
// save"), SIGNED IN (email + Account/Connections links + Sign out). Uses ONLY createBrowserSupabase
// (publishable key) — never admin/@/agents/@/llm (client/key-safety boundary, src/store/boundary.test.ts).
import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import { Button } from "@/ui/primitives";

export function AccountMenu() {
  const { user, loading } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      const { error: err } = await createBrowserSupabase().auth.signOut();
      if (err) setError(err.message);
    } catch {
      setError("Sign out failed — check your connection.");
    } finally {
      setSigningOut(false);
    }
  }

  // ── LOADING ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <span
        data-testid="account-menu-loading"
        className="label"
        style={{ color: "var(--muted)" }}
      >
        ···
      </span>
    );
  }

  // ── GUEST (empty state — no session) ───────────────────────────────
  if (!user) {
    return (
      <Link
        href="/login"
        data-testid="account-menu-guest"
        className="btn"
        style={{ textDecoration: "none" }}
      >
        Sign in to save
      </Link>
    );
  }

  // ── SIGNED IN ────────────────────────────────────────────────────────
  return (
    <div data-testid="account-menu-user" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        className="mono"
        title={user.email ?? user.id}
        style={{
          fontSize: 11,
          color: "var(--muted)",
          maxWidth: 160,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {user.email ?? user.id}
      </span>
      <Link href="/account" className="btn" style={{ textDecoration: "none" }}>
        Account
      </Link>
      <Link href="/account/connections" className="btn" style={{ textDecoration: "none" }}>
        Connections
      </Link>
      <Button onClick={handleSignOut} disabled={signingOut} title={error ?? undefined}>
        {signingOut ? "Signing out…" : error ? "Retry sign out" : "Sign out"}
      </Button>
    </div>
  );
}
