"use client";
// P2-T6/T14 · /account — profile, export, delete. Client component (uses useSession, the
// publishable browser client, and plain fetch to the RLS-scoped API routes — never admin/@/agents/
// @/llm). States: LOADING, GUEST (empty — no session), SIGNED IN (with per-action loading/error).
import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Button, SectionHeader, LedgerRow } from "@/ui/primitives";

type ExportState = "idle" | "exporting" | "error";
type DeleteState = "idle" | "confirm" | "deleting" | "error";

export default function AccountPage() {
  const { user, loading } = useSession();
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleExport() {
    setExportState("exporting");
    try {
      const res = await fetch("/api/decisions");
      if (!res.ok) throw new Error("export failed");
      const body = (await res.json()) as { entries?: unknown[] };
      const blob = new Blob([JSON.stringify(body.entries ?? [], null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "keystone-decisions.json";
      a.click();
      URL.revokeObjectURL(url);
      setExportState("idle");
    } catch {
      setExportState("error");
    }
  }

  async function handleDelete() {
    setDeleteState("deleting");
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(body.error ?? "Could not delete the account.");
        setDeleteState("error");
        return;
      }
      await createBrowserSupabase().auth.signOut();
      window.location.href = "/";
    } catch {
      setDeleteError("Could not delete the account — check your connection and try again.");
      setDeleteState("error");
    }
  }

  // ── LOADING ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="label" data-testid="account-loading" style={{ padding: 24 }}>
        LOADING ACCOUNT…
      </div>
    );
  }

  // ── GUEST (empty state) ──────────────────────────────────────────────
  if (!user) {
    return (
      <div data-testid="account-guest" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="label" style={{ textTransform: "none" }}>
          You need to sign in to view your account.
        </p>
        <Link href="/login" className="btn" style={{ textDecoration: "none", width: "fit-content" }}>
          Sign in
        </Link>
      </div>
    );
  }

  // ── SIGNED IN ────────────────────────────────────────────────────────
  return (
    <div data-testid="account-signed-in" style={{ minHeight: "100vh", background: "var(--bg)", padding: "26px 22px 56px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <Link href="/studio" className="label" style={{ textDecoration: "none", color: "var(--ink-2)" }}>
          ← BACK TO STUDIO
        </Link>
        <SectionHeader>Account</SectionHeader>
        <div className="panel" style={{ padding: 14 }}>
          <LedgerRow label="Email" value={user.email ?? user.id} />
        </div>

        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHeader>Export</SectionHeader>
          <p className="label" style={{ textTransform: "none" }}>
            Download every saved decision as JSON.
          </p>
          <Button onClick={handleExport} disabled={exportState === "exporting"}>
            {exportState === "exporting" ? "Exporting…" : "Export decisions"}
          </Button>
          {exportState === "error" && (
            <p className="label" data-testid="export-error" style={{ textTransform: "none", color: "var(--bad)" }}>
              Export failed — check your connection and try again.
            </p>
          )}
        </div>

        <div
          className="panel"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, borderColor: "var(--bad)" }}
        >
          <SectionHeader>Danger zone</SectionHeader>
          <p className="label" style={{ textTransform: "none" }}>
            Deletes your account and every saved decision. This cannot be undone.
          </p>
          {deleteState !== "confirm" && deleteState !== "deleting" ? (
            <Button onClick={() => setDeleteState("confirm")} style={{ width: "fit-content" }}>
              Delete account
            </Button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={handleDelete} disabled={deleteState === "deleting"}>
                {deleteState === "deleting" ? "Deleting…" : "Confirm delete"}
              </Button>
              <Button onClick={() => setDeleteState("idle")} disabled={deleteState === "deleting"}>
                Cancel
              </Button>
            </div>
          )}
          {deleteState === "error" && deleteError && (
            <p className="label" data-testid="delete-error" style={{ textTransform: "none", color: "var(--bad)" }}>
              {deleteError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
