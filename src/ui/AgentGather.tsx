"use client";
// CONTEXT tab — LEFT column per sub-tab (plan §2.1). Renders the per-kind source
// input(s), a RUN AGENT button, a live AGENT LOG (streamed AgentEvents → LedgerRows),
// and a FINDINGS ledger once the agent finishes. fetch-only via useAgentStream — this
// file never imports @/agents/* server code, so the key never enters the bundle.
import { useEffect, useRef, useState } from "react";
import type { GatherFinding, GatherKind, GatherSource } from "@/agents/types";
import type { UseAgentStream } from "@/lib/useAgentStream";
import { Button, Eyebrow, Field } from "@/ui/primitives";

// muted provenance tag rendered on the right of a finding/log value.
function Source({ children }: { children: React.ReactNode }) {
  return (
    <span className="label" style={{ marginLeft: 8, fontSize: 10, color: "var(--muted)" }}>
      {children}
    </span>
  );
}

// A small mono chip for a finding's extracted quantity or named entity (V8-C2). `ink` tone for
// numbers (stronger), `muted` tone for entities — same square, hairline-bordered CAD-ledger look.
function Chip({
  children,
  testid,
  tone,
}: {
  children: React.ReactNode;
  testid: string;
  tone: "ink" | "muted";
}) {
  return (
    <span
      data-testid={testid}
      className="mono"
      style={{
        fontSize: 10,
        padding: "2px 7px",
        border: "1px solid var(--hair-strong)",
        borderRadius: 999,
        background: "var(--panel)",
        color: tone === "ink" ? "var(--ink-2)" : "var(--muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// Terminal source chip for the finished run: LIVE (real agent, green ok tone) vs
// CACHED (offline/fixture data, calm neutral tone) — factual provenance, not an apology.
function SourceChip({ source }: { source: "live" | "fixture" }) {
  const live = source === "live";
  const fg = live ? "var(--ok)" : "var(--muted)";
  const bg = live ? "var(--ok-weak)" : "var(--panel-2)";
  return (
    <span
      data-testid="gather-source-chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--sans)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
      {live ? "LIVE" : "CACHED"}
    </span>
  );
}

// A WRAPPING ledger line for the agent log + each finding's header. Unlike the shared
// LedgerRow (whose `.ledger-value` is `white-space:nowrap` and right-aligned — fine for a
// short numeral, but it lets a long status/finding sentence run outside the card), this keeps
// a fixed muted tag on the left and lets the value fill the rest and BREAK onto new lines, so
// the text always stays inside its box. `min-width:0` on the value is what lets it wrap.
function Line({
  label,
  value,
  accent,
  divider = true,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  accent?: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "baseline",
        minWidth: 0,
        padding: "5px 0",
        borderBottom: divider ? "1px solid var(--hair)" : "none",
      }}
    >
      <span className="label" style={{ flex: "0 0 auto", fontSize: 10, lineHeight: 1.5 }}>
        {label}
      </span>
      <span
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          textAlign: "left",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          fontFamily: "var(--sans)",
          fontSize: 12.5,
          lineHeight: 1.45,
          color: accent ?? "var(--ink)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** The prefilled source-field values for a scenario (fields align 1:1 with the local inputs). */
export interface AgentSeed {
  repoUrl?: string;
  branch?: string;
  website?: string;
  /** Prefilled as a comma-joined string (buildSource splits it back apart). */
  competitors?: string[];
  notes?: string;
}

export function AgentGather({
  kind,
  stream,
  onSummary,
  onFindings,
  seed,
  seedKey,
}: {
  kind: GatherKind;
  /** The agent stream state + run(), OWNED BY ContextTab (one per kind) so it survives this
   *  component unmounting on a sub-tab switch — otherwise the log/findings vanished when you
   *  left and came back to a kind. AgentGather is now purely presentational over it. */
  stream: UseAgentStream;
  onSummary: (summary: string) => void;
  /** V3-8: lifts the gathered facts so live extraction can ground confidences (V3-6). */
  onFindings?: (facts: GatherFinding[]) => void;
  /** Prefilled real source values for the active scenario (blank when CUSTOM / absent). */
  seed?: AgentSeed;
  /** Changes when the scenario changes — the trigger to RE-SEED the fields (mirrors how the
   *  manual textareas re-seed on an explicit mode click). Editing a source field is purely
   *  local, so it never trips the ContextTab edit-flip that drops the scenario pin. */
  seedKey?: string;
}) {
  const { events, findings, running, elapsedSec, run } = stream;

  // Per-kind source inputs (local state) — initialised from the scenario seed so a pinned
  // demo shows the REAL source values (blank for CUSTOM / an unseeded kind).
  const [repoUrl, setRepoUrl] = useState(seed?.repoUrl ?? "");
  const [branch, setBranch] = useState(seed?.branch ?? "");
  const [website, setWebsite] = useState(seed?.website ?? "");
  const [competitors, setCompetitors] = useState(seed?.competitors?.join(", ") ?? "");
  const [notes, setNotes] = useState(seed?.notes ?? "");

  // RE-SEED when the scenario changes. Keyed on `seedKey` (the mode id) — NOT on `seed`'s
  // object identity, which the parent recreates every render and would clobber user edits.
  // `seed` is read fresh here but intentionally excluded from deps for that reason.
  const seededRef = useRef(seedKey);
  useEffect(() => {
    if (seededRef.current === seedKey) return; // skip the mount pass; state already seeded
    seededRef.current = seedKey;
    setRepoUrl(seed?.repoUrl ?? "");
    setBranch(seed?.branch ?? "");
    setWebsite(seed?.website ?? "");
    setCompetitors(seed?.competitors?.join(", ") ?? "");
    setNotes(seed?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  // Surface the summary to the parent when the agent finishes. Keep the latest
  // callback in a ref so the effect fires purely on `findings` changing.
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;
  const onFindingsRef = useRef(onFindings);
  onFindingsRef.current = onFindings;
  useEffect(() => {
    if (findings) {
      onSummaryRef.current(findings.summary);
      onFindingsRef.current?.(findings.facts);
    }
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

  // Provenance of the finished run — the `done`/last event carries the source.
  const lastDone = [...events].reverse().find((e) => e.type === "done");
  const doneSource = lastDone?.type === "done" ? lastDone.source : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      {/* ── SOURCE ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Eyebrow>Agent-gathered</Eyebrow>
          <span style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.4 }}>
            The agent reads these real sources and reports what it finds below.
          </span>
        </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
          <Button primary={!running} onClick={() => void run(kind, buildSource())} disabled={running}>
            {running ? `RUNNING… ${elapsedSec}s` : "RUN AGENT"}
          </Button>
          {doneSource && <SourceChip source={doneSource} />}
        </div>
      </div>

      {/* ── AGENT LOG ──────────────────────────────────────────── */}
      {(events.length > 0 || running) && (
        <div>
          <Eyebrow style={{ display: "block", marginBottom: 8 }}>Agent Log</Eyebrow>
          <div
            className="panel-inset"
            style={{ padding: "6px 12px", border: "1px solid var(--hair)", minWidth: 0, overflowWrap: "anywhere" }}
          >
          {events.map((e, i) => {
            if (e.type === "status") {
              return <Line key={i} label="status" value={e.message} />;
            }
            if (e.type === "error") {
              return <Line key={i} label="error" value={e.message} accent="var(--bad)" />;
            }
            if (e.type === "finding") {
              return (
                <Line
                  key={i}
                  label={e.finding.label}
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
            return <Line key={i} label="done" value={e.source} accent="var(--ok)" />;
          })}
          {/* Heartbeat — a live, ticking "still working" line while the run is in flight, so the
              business agent's long silent web-search gap reads as alive rather than hung. The
              ticking second count is the liveness signal; it vanishes the moment the run ends. */}
          {running && (
            <div
              data-testid="agent-heartbeat"
              className="mono"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 0 2px",
                fontSize: 11,
                color: "var(--muted)",
              }}
            >
              <span aria-hidden>◦</span>
              <span>working… {elapsedSec}s</span>
            </div>
          )}
          </div>
        </div>
      )}

      {/* ── FINDINGS ───────────────────────────────────────────── */}
      {findings && (
        <div>
          <Eyebrow style={{ display: "block", marginBottom: 8 }}>Findings</Eyebrow>
          {findings.facts.map((f, i) => (
            <div
              key={i}
              data-testid="finding"
              className="panel-inset"
              style={{ padding: "8px 12px", border: "1px solid var(--hair)", marginBottom: 8, minWidth: 0, overflowWrap: "anywhere" }}
            >
              <Line
                label={f.label}
                divider={false}
                value={
                  <>
                    {f.value}
                    <Source>{f.source}</Source>
                  </>
                }
              />
              {/* V8-C2 · the deeper, typed research now reaches the eye: a verbatim quote from the
                  source, extracted numbers + named entities as mono chips, and the implication. */}
              {f.sourceExcerpt && (
                <blockquote
                  data-testid="finding-excerpt"
                  className="mono"
                  style={{
                    margin: "3px 0 0 2px",
                    padding: "1px 0 1px 8px",
                    borderLeft: "2px solid var(--hair-strong)",
                    fontSize: 10.5,
                    color: "var(--ink-2)",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.4,
                  }}
                >
                  {f.sourceExcerpt}
                </blockquote>
              )}
              {((f.quantities && f.quantities.length > 0) || (f.entities && f.entities.length > 0)) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingTop: 4 }}>
                  {f.quantities?.map((q, j) => (
                    <Chip key={`q${j}`} testid="finding-quantity" tone="ink">
                      {q.metric}: {q.value}
                      {q.unit ? ` ${q.unit}` : ""}
                    </Chip>
                  ))}
                  {f.entities?.map((e, j) => (
                    <Chip key={`e${j}`} testid="finding-entity" tone="muted">
                      {e}
                    </Chip>
                  ))}
                </div>
              )}
              {f.implication && (
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--muted)", padding: "3px 0 0 2px", lineHeight: 1.4 }}
                >
                  → {f.implication}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
