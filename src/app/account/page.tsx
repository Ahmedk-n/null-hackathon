"use client";
// P2-T6/T14 · /account — profile, export, delete, and (P2-T6) the "Your decisions" list with
// per-entry outcome resolution. Client component (uses useSession, the publishable browser
// client, listEntries/resolveOutcome from @/lib/library — client-safe, backend-resolved — and
// plain fetch to the RLS-scoped API routes — never admin/@/agents/@/llm). States: LOADING, GUEST
// (empty — no session), SIGNED IN (with per-action loading/error).
//
// Dates: never `new Date(...)`/Date.now — only the server-passed ISO strings
// (savedAtISO/resolvedAtISO) are rendered, sliced as plain strings.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { listEntries, resolveOutcome, type LibraryEntry } from "@/lib/library";
import { Button, SectionHeader, LedgerRow } from "@/ui/primitives";

type ExportState = "idle" | "exporting" | "error";
type DeleteState = "idle" | "confirm" | "deleting" | "error";
type EntriesState = "loading" | "ready";

// Plain string slicing on a server-passed ISO stamp — see the file-header note on dates.
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export default function AccountPage() {
  const { user, loading } = useSession();
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [entriesState, setEntriesState] = useState<EntriesState>("loading");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setEntriesState("loading");
    listEntries().then((all) => {
      if (cancelled) return;
      setEntries(all);
      setEntriesState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleResolve(id: string, outcome: "held" | "failed") {
    setResolvingId(id);
    setOutcomeError(null);
    const updated = await resolveOutcome(id, outcome);
    setResolvingId(null);
    if (!updated) {
      setOutcomeError("Could not record the outcome — check your connection and try again.");
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
  }

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
          <SectionHeader>Your decisions</SectionHeader>
          {entriesState === "loading" ? (
            <p className="label" data-testid="decisions-loading" style={{ textTransform: "none" }}>
              LOADING DECISIONS…
            </p>
          ) : entries.length === 0 ? (
            <p className="label" data-testid="decisions-empty" style={{ textTransform: "none" }}>
              No saved decisions yet.
            </p>
          ) : (
            <div data-testid="decisions-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  data-testid={`decision-row-${entry.id}`}
                  className="ledger-row"
                  style={{ flexWrap: "wrap", gap: 8 }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span className="label" style={{ textTransform: "none" }}>
                      {entry.title}
                    </span>
                    <span className="label mono" style={{ color: "var(--muted)" }}>
                      SAVED {dateOnly(entry.savedAtISO)}
                    </span>
                  </div>
                  {entry.outcome ? (
                    <span
                      className="ledger-value mono"
                      data-testid={`decision-outcome-${entry.id}`}
                      style={{ color: entry.outcome === "failed" ? "var(--bad)" : "var(--ok)" }}
                    >
                      OUTCOME · {entry.outcome.toUpperCase()}
                      {entry.resolvedAtISO ? ` · ${dateOnly(entry.resolvedAtISO)}` : ""}
                    </span>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        onClick={() => handleResolve(entry.id, "held")}
                        disabled={resolvingId === entry.id}
                      >
                        HELD
                      </Button>
                      <Button
                        onClick={() => handleResolve(entry.id, "failed")}
                        disabled={resolvingId === entry.id}
                        style={{ borderColor: "var(--bad)", color: "var(--bad)" }}
                      >
                        FAILED
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {outcomeError && (
            <p className="label" data-testid="outcome-error" style={{ textTransform: "none", color: "var(--bad)" }}>
              {outcomeError}
            </p>
          )}
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
