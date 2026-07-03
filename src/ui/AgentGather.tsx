"use client";
// CONTEXT tab — LEFT column per sub-tab (plan §2.1). Renders the per-kind source
// input(s), a RUN AGENT button, a live AGENT LOG (streamed AgentEvents → LedgerRows),
// and a FINDINGS ledger once the agent finishes. fetch-only via useAgentStream — this
// file never imports @/agents/* server code, so the key never enters the bundle.
import { useEffect, useRef, useState } from "react";
import type { GatherKind, GatherSource } from "@/agents/types";
import { useAgentStream } from "@/lib/useAgentStream";
import { Button, Chip, Field, LedgerRow, SectionHeader } from "@/ui/primitives";

// muted provenance tag rendered on the right of a finding/log value.
function Source({ children }: { children: React.ReactNode }) {
  return (
    <span className="label" style={{ marginLeft: 8, fontSize: 10, color: "var(--muted)" }}>
      {children}
    </span>
  );
}

export function AgentGather({
  kind,
  onSummary,
}: {
  kind: GatherKind;
  onSummary: (summary: string) => void;
}) {
  const { events, findings, running, run } = useAgentStream();

  // Per-kind source inputs (local state).
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [website, setWebsite] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [notes, setNotes] = useState("");

  // Surface the summary to the parent when the agent finishes. Keep the latest
  // callback in a ref so the effect fires purely on `findings` changing.
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;
  useEffect(() => {
    if (findings) onSummaryRef.current(findings.summary);
  }, [findings]);

  function buildSource(): GatherSource {
    if (kind === "technical") {
      return { repoUrl: repoUrl.trim() || undefined, branch: branch.trim() || undefined };
    }
    if (kind === "business") {
      const list = competitors
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      return {
        website: website.trim() || undefined,
        competitors: list.length ? list : undefined,
        notes: notes.trim() || undefined,
      };
    }
    return { notes: notes.trim() };
  }

  // Is the finished run a scripted (offline) fixture? The `done`/last event carries it.
  const lastDone = [...events].reverse().find((e) => e.type === "done");
  const isFixture = lastDone?.type === "done" && lastDone.source === "fixture";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      {/* ── SOURCE ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SectionHeader>Agent Gather</SectionHeader>
        {kind === "technical" && (
          <>
            <Field label="Repo URL" value={repoUrl} onChange={setRepoUrl} placeholder="github.com/org/repo" />
            <Field label="Branch" value={branch} onChange={setBranch} placeholder="main" />
          </>
        )}
        {kind === "business" && (
          <>
            <Field label="Website" value={website} onChange={setWebsite} placeholder="https://acme.com" />
            <Field
              label="Competitors"
              value={competitors}
              onChange={setCompetitors}
              placeholder="comma-separated urls / names"
              mono={false}
            />
            <Field label="Notes" value={notes} onChange={setNotes} rows={3} placeholder="anything else…" mono={false} />
          </>
        )}
        {kind === "temporal" && (
          <Field
            label="Notes / Agenda"
            value={notes}
            onChange={setNotes}
            rows={5}
            placeholder="paste meetings, deadlines, agenda…"
            mono={false}
          />
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button onClick={() => void run(kind, buildSource())} disabled={running}>
            {running ? "RUNNING…" : "RUN AGENT"}
          </Button>
          {isFixture && <Chip tone="warn">⚠ demo fallback</Chip>}
        </div>
      </div>

      {/* ── AGENT LOG ──────────────────────────────────────────── */}
      {events.length > 0 && (
        <div>
          <SectionHeader>Agent Log</SectionHeader>
          {events.map((e, i) => {
            if (e.type === "status") {
              return <LedgerRow key={i} label="status" value={e.message} mono={false} />;
            }
            if (e.type === "error") {
              return <LedgerRow key={i} label="error" value={e.message} mono={false} accent="var(--bad)" />;
            }
            if (e.type === "finding") {
              return (
                <LedgerRow
                  key={i}
                  label={e.finding.label}
                  mono={false}
                  value={
                    <>
                      {e.finding.value}
                      <Source>{e.finding.source}</Source>
                    </>
                  }
                />
              );
            }
            // done
            return <LedgerRow key={i} label="done" value={e.source} accent="var(--ok)" />;
          })}
        </div>
      )}

      {/* ── FINDINGS ───────────────────────────────────────────── */}
      {findings && (
        <div>
          <SectionHeader>Findings</SectionHeader>
          {findings.facts.map((f, i) => (
            <LedgerRow
              key={i}
              label={f.label}
              mono={false}
              value={
                <>
                  {f.value}
                  <Source>{f.source}</Source>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
