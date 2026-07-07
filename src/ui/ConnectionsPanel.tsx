"use client";
// Connections registry UI (plan Task 9): list / add / test / revoke. Reads via
// GET /api/connections (the secret-omitting `connections_public` view) and writes
// via POST/PATCH/DELETE on the same routes. The secret is submitted once on ADD
// and never received back — every row this component holds in state comes from
// the server's public shape (no `secret` field exists to leak). No `Date.now`/
// `Math.random`/`new Date(` here — this is a client bundle file; `last_used_at`/
// `created_at` are rendered as the raw server-issued ISO strings.
import { useEffect, useState } from "react";
import type { ConnectionKind, ConnectionPublic } from "@/lib/supabase/types";
import { CONNECTION_KINDS, CONNECTION_KIND_ORDER } from "@/lib/mcp/kinds";
import { Button, Chip, Field, LedgerRow, SectionHeader, Select } from "@/ui/primitives";

type LoadState = "loading" | "loaded" | "error";

function healthTone(status: ConnectionPublic["status"]): "ok" | "bad" | "muted" {
  if (status === "ok") return "ok";
  if (status === "error") return "bad";
  return "muted";
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function ConnectionsPanel() {
  const [state, setState] = useState<LoadState>("loading");
  const [connections, setConnections] = useState<ConnectionPublic[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ConnectionKind>("github");
  const [name, setName] = useState("");
  const [url, setUrl] = useState(CONNECTION_KINDS.github.url);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function load() {
    setState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/connections");
      const data = await readJson<{ connections?: ConnectionPublic[]; error?: string }>(res);
      if (!res.ok) {
        setLoadError(data?.error ?? `failed to load connections (${res.status})`);
        setState("error");
        return;
      }
      setConnections(data?.connections ?? []);
      setState("loaded");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "failed to load connections");
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function pickKind(next: ConnectionKind) {
    setKind(next);
    setUrl(CONNECTION_KINDS[next].url);
  }

  function resetForm() {
    setName("");
    setSecret("");
    setUrl(CONNECTION_KINDS[kind].url);
    setFormError(null);
  }

  async function handleAdd() {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim() || undefined,
          url: url.trim() || undefined,
          secret: secret.trim() || undefined,
        }),
      });
      const data = await readJson<{ connection?: ConnectionPublic; error?: string }>(res);
      if (!res.ok || !data?.connection) {
        setFormError(data?.error ?? `failed to add connection (${res.status})`);
        return;
      }
      setConnections((prev) => [data.connection as ConnectionPublic, ...prev]);
      setAdding(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "failed to add connection");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id: string) {
    setBusyId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/connections/${id}/test`, { method: "POST" });
      const data = await readJson<{ status?: ConnectionPublic["status"]; message?: string }>(res);
      if (data?.status) {
        setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, status: data.status as ConnectionPublic["status"] } : c)));
      }
      setRowError((prev) => ({ ...prev, [id]: data?.message ?? "" }));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "test failed" }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      const data = await readJson<{ ok?: boolean; error?: string }>(res);
      if (data?.ok) {
        setConnections((prev) => prev.filter((c) => c.id !== id));
        return;
      }
      setRowError((prev) => ({ ...prev, [id]: data?.error ?? `failed to revoke (${res.status})` }));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "failed to revoke" }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader>Connections</SectionHeader>
        <Button
          onClick={() => {
            setAdding((v) => !v);
            if (adding) resetForm();
          }}
        >
          {adding ? "CANCEL" : "ADD"}
        </Button>
      </div>

      {adding && (
        <div
          data-testid="connection-form"
          className="panel-inset"
          style={{ display: "flex", flexDirection: "column", gap: 8, padding: "var(--pad)" }}
        >
          <Select
            label="Kind"
            value={kind}
            onChange={(v) => pickKind(v as ConnectionKind)}
            options={CONNECTION_KIND_ORDER.map((k) => ({ value: k, label: CONNECTION_KINDS[k].label }))}
          />
          <Field label="Name" value={name} onChange={setName} placeholder={CONNECTION_KINDS[kind].label} mono={false} />
          <Field label="URL" value={url} onChange={setUrl} placeholder="https://…" />
          <Field
            label={CONNECTION_KINDS[kind].secretLabel}
            value={secret}
            onChange={setSecret}
            placeholder="paste token…"
          />
          {formError && <LedgerRow label="error" value={formError} mono={false} accent="var(--bad)" />}
          <Button primary onClick={() => void handleAdd()} disabled={saving || !url.trim()}>
            {saving ? "SAVING…" : "SAVE"}
          </Button>
        </div>
      )}

      {state === "loading" && <LedgerRow label="status" value="loading…" mono={false} />}
      {state === "error" && (
        <LedgerRow label="error" value={loadError ?? "failed to load connections"} mono={false} accent="var(--bad)" />
      )}
      {state === "loaded" && connections.length === 0 && (
        <LedgerRow label="status" value="no connections yet — add one above" mono={false} />
      )}

      {state === "loaded" &&
        connections.map((c) => (
          <div
            key={c.id}
            data-testid="connection-row"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingBottom: 8,
              borderBottom: "1px solid var(--hair)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="label" style={{ minWidth: 70 }}>
                {CONNECTION_KINDS[c.kind].label}
              </span>
              <span className="mono" style={{ flex: 1 }}>
                {c.name}
              </span>
              <Chip tone={healthTone(c.status)}>{c.status.toUpperCase()}</Chip>
            </div>
            <LedgerRow label="url" value={c.url} />
            <LedgerRow label="last used" value={c.last_used_at ?? "never"} />
            {rowError[c.id] && <LedgerRow label="error" value={rowError[c.id]} mono={false} accent="var(--bad)" />}
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => void handleTest(c.id)} disabled={busyId === c.id}>
                {busyId === c.id ? "…" : "TEST"}
              </Button>
              <Button onClick={() => void handleRevoke(c.id)} disabled={busyId === c.id}>
                REVOKE
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
