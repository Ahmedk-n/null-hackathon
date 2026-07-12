"use client";
// Tab 1 — CONTEXT (plan §2.1). Inner sub-tabs BUSINESS · TECHNICAL · TEMPORAL · DECISION.
// Each of the first three = LEFT <AgentGather/> + RIGHT a MANUAL textarea (seeded from
// the active scenario, appended when the agent emits a summary). DECISION = one textarea.
// The four textareas compose the ContextInput handed to onAnalyse.
//
// V3-5 — JUDGE MODE. The MODE segmented control has three positions:
//   A / B  → PINNED scenarios that seed the textareas and route the whole fixture chain
//            (context → extract → attacks) byte-deterministically (the rehearsed demo).
//   CUSTOM → the live path: textareas clear and analyse() drops the `scenario` arg so the
//            server fires the real Claude chain when a key exists (fixture fallback otherwise).
// Editing ANY textarea while pinned to A/B auto-flips the mode to CUSTOM — the seeded text
// stays as the user's starting point, only the scenario pin drops. This is the keystroke that
// used to reveal the demo was on rails; now it just works.
import { useEffect, useState } from "react";
import type { ContextInput, DecisionContextPack, ScenarioId } from "@/context";
import { SCENARIOS } from "@/context/fixtures";
import type { GatherFinding, GatherKind } from "@/agents/types";
import { AgentGather } from "@/ui/AgentGather";
import { useAgentStream, type UseAgentStream } from "@/lib/useAgentStream";
import { Button, Field, SectionHeader, Tabs } from "@/ui/primitives";
// C-3 · the store singleton — read directly (no prop-drilling) for the post-compile strip below.
import { useKeystone } from "@/store/useKeystone";
// V5-4 · decision library — the localStorage/Supabase snapshot layer (SSR-safe, no wall-clock).
// P2-T7 · getLibraryBackend/remoteSetPublic power the SHARE toggle (signed-in only — guest/local
// entries have no server row to share).
import {
  listEntries,
  duplicateEntry,
  deleteEntry,
  getLibraryBackend,
  remoteSetPublic,
  type LibraryEntry,
} from "@/lib/library";
import { statusWord, statusAccent } from "@/ui/memo/derive";

// The CONTEXT tab's operating mode: a pinned demo scenario, or the live custom path.
export type ContextMode = ScenarioId | "custom";

const EMPTY_INPUT: ContextInput = {
  businessContextText: "",
  technicalContextText: "",
  temporalContextText: "",
  decisionText: "",
};

// The seed for a given mode — pinned scenarios pull their pre-filled input; CUSTOM starts blank.
function seedFor(mode: ContextMode): ContextInput {
  return mode === "custom" ? EMPTY_INPUT : SCENARIOS[mode].input;
}

const SUB_TABS = [
  { id: "business", label: "BUSINESS" },
  { id: "technical", label: "TECHNICAL" },
  { id: "temporal", label: "TEMPORAL" },
  { id: "decision", label: "DECISION" },
];

// Append the agent summary onto the manual textarea, de-duplicated so repeated runs
// don't stack. Seeded manual text is preserved above the agent contribution.
function mergeSummary(prev: string, summary: string): string {
  const s = summary.trim();
  if (!s || prev.includes(s)) return prev;
  return prev.trim() ? `${prev.trim()}\n\n${s}` : s;
}

const COL: React.CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--gap)" };

// MODULE-LEVEL so its identity is STABLE across ContextTab re-renders. Previously this was a
// function declared inside ContextTab's body and used as <ContextPane/> — every parent re-render
// minted a new component type, so React unmounted+remounted the whole pane, wiping AgentGather's
// streamed log + findings. Because a finished gather calls onSummary → setBusiness (parent state),
// finishing a run triggered exactly that remount: the agent log "disappeared the second it
// finished". Hoisting it keeps AgentGather (and its useAgentStream state) mounted across renders.
function ContextPane({
  kind,
  mode,
  stream,
  manualValue,
  manualSet,
  onManualEdit,
  onGatherFindings,
}: {
  kind: GatherKind;
  mode: ContextMode;
  /** This kind's agent stream state — owned by ContextTab so it survives a sub-tab switch. */
  stream: UseAgentStream;
  /** Current manual text — agent summaries merge onto it (no edit-flip). */
  manualValue: string;
  /** Raw setter — used by onSummary so an agent summary does NOT trip the scenario-pin flip. */
  manualSet: (v: string) => void;
  /** Edit-flip-wrapped setter — used by the textarea so a direct keystroke drops the pin. */
  onManualEdit: (v: string) => void;
  onGatherFindings?: (kind: GatherKind, facts: GatherFinding[]) => void;
}) {
  // The pinned scenario's REAL source values for this kind (blank on CUSTOM). Keyed on `mode`
  // (via AgentGather's seedKey) so an explicit scenario switch re-seeds the source fields.
  const seed = mode === "custom" ? undefined : SCENARIOS[mode].sources?.[kind];
  return (
    <div className="context-pane">
      <div className="context-pane-gather" style={COL}>
        {/* Agent summaries layer onto the manual text but do NOT trip the edit-flip — only a
            direct user keystroke drops the scenario pin (V3-5 spec: "if the user EDITS"). */}
        <AgentGather
          kind={kind}
          stream={stream}
          seed={seed}
          seedKey={mode}
          onSummary={(s) => manualSet(mergeSummary(manualValue, s))}
          onFindings={(facts) => onGatherFindings?.(kind, facts)}
        />
      </div>
      <div className="context-pane-manual" style={COL}>
        <SectionHeader>Manual</SectionHeader>
        <Field
          label={`${kind} context`}
          value={manualValue}
          onChange={onManualEdit}
          rows={12}
          placeholder="layer your own context on top of the agent summary…"
          mono={false}
        />
      </div>
    </div>
  );
}
// C-1: PANE used to be an inline ROW (`display:"flex"`) laying AgentGather beside the manual
// textarea. That's now the `.context-pane` class in theme.css, which stacks below ~900px
// (gather ABOVE its matching textarea) and gives the manual textarea the dominant width on
// desktop (`.context-pane-gather` ~40%, `.context-pane-manual` ~60%). See theme.css.

// MODE selector — a terminal segmented control (NOT the Tabs primitive, so it carries no
// `data-tab`). A/B re-seed the textareas + pin the fixture chain; CUSTOM clears + goes live.
// C-2: segments used to show the full scenario label and ellipsis-clip on narrow widths,
// cutting the OUTCOME parenthetical (COLLAPSES / HOLDS) first — the most informative part.
// Now each segment is two lines: id + short name (may still ellipsis — least informative part)
// on top, a bold OUTCOME word on the bottom that never truncates. Full label lives in `title`.
function ModeSelect({
  mode,
  onSelect,
}: {
  mode: ContextMode;
  onSelect: (m: ContextMode) => void;
}) {
  const segs: { id: ContextMode; idLabel: string; name: string; outcome: string; full: string }[] = [
    { id: "R", idLabel: "R", name: "EXCALIDRAW", outcome: "REAL", full: "R — Real: Excalidraw" },
    { id: "A", idLabel: "A", name: "MIGRATE BEFORE PILOT", outcome: "COLLAPSES", full: SCENARIOS.A.label },
    { id: "B", idLabel: "B", name: "REINFORCE FIRST", outcome: "HOLDS", full: SCENARIOS.B.label },
    { id: "custom", idLabel: "C", name: "CUSTOM", outcome: "LIVE", full: "C — Custom (Live)" },
  ];
  const segStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "6px 8px",
    fontFamily: "var(--mono)",
    textAlign: "left",
    cursor: "pointer",
    border: "none",
    borderRadius: 0,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
  });
  // Line 1 (id + short name) may still ellipsis on a very narrow segment — it's the least
  // informative part now that the outcome has its own line.
  const nameLine: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  // Line 2 — the outcome. Short by construction (REAL/COLLAPSES/HOLDS/LIVE); no clipping rule
  // applied on purpose, so it can never be the thing that truncates.
  const outcomeLine: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
  };
  return (
    <div>
      <span className="label" style={{ display: "block", marginBottom: 5 }}>
        Mode
      </span>
      <div
        data-testid="scenario-select"
        style={{ display: "flex", border: "1px solid var(--hair-strong)", borderRadius: 0 }}
      >
        {segs.map((s) => (
          <button
            key={s.id}
            type="button"
            data-scenario={s.id}
            aria-pressed={mode === s.id}
            onClick={() => onSelect(s.id)}
            title={s.full}
            style={segStyle(mode === s.id)}
          >
            <span style={nameLine}>
              {s.idLabel} — {s.name}
            </span>
            <span style={outcomeLine}>{s.outcome}</span>
          </button>
        ))}
      </div>
      <ModeChip mode={mode} />
    </div>
  );
}

// The visible truth-in-labelling chip. Pinned A/B read neutral; CUSTOM reads --ok because it is
// the live path. The client can't know whether a key exists (that's server-side), so CUSTOM is
// labelled honestly as "CUSTOM · LIVE" and the per-stage Source status tells the real outcome.
function ModeChip({ mode }: { mode: ContextMode }) {
  const custom = mode === "custom";
  const color = custom ? "var(--ok)" : "var(--muted)";
  const text = custom ? "CUSTOM · LIVE" : `PINNED · SCENARIO ${mode}`;
  return (
    <span
      className="mono"
      data-testid="mode-chip"
      data-mode={mode}
      style={{
        display: "inline-block",
        marginTop: 8,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "2px 8px",
        border: `1px solid ${color}`,
        borderRadius: 0,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

// ── C-3 · COMPILED strip ─────────────────────────────────────────────────────────────────────
// After ANALYSE, returning to CONTEXT showed the identical gather form — no signal a compile
// happened. This strip is purely additive: hidden until a `decisionContextPack` lands in the
// store, then a one-line ledger stamp (fact count + PINNED/LIVE source) with a jump to GRAPH.
// Fact count = the three `relevant*Facts` arrays (business/technical/temporal) — the pack's
// constraints/objectives/risks are a different shape, not "facts".
function CompiledStrip({
  pack,
  source,
  onOpenGraph,
}: {
  pack: DecisionContextPack;
  source: "live" | "fixture" | null;
  onOpenGraph?: () => void;
}) {
  const factCount =
    pack.relevantBusinessFacts.length + pack.relevantTechnicalFacts.length + pack.relevantTemporalFacts.length;
  // Reuse the MODE chip's PINNED/LIVE vocabulary (not AgentGather's LIVE/CACHED) — this strip
  // reports the compiled PACK's provenance, which the judge already reads as PINNED vs LIVE.
  const live = source === "live";
  return (
    <div
      data-testid="compiled-strip"
      className="mono"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 10px",
        border: "1px solid var(--hair-strong)",
        background: "var(--panel-2)",
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        COMPILED — {factCount} FACTS · {live ? "LIVE" : "PINNED"}
      </span>
      {onOpenGraph && (
        <button
          type="button"
          data-testid="compiled-strip-open-graph"
          onClick={onOpenGraph}
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "2px 8px",
            border: "1px solid var(--hair-strong)",
            background: "transparent",
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          View Graph →
        </button>
      )}
    </div>
  );
}

// ── V5-4 · LIBRARY ledger ─────────────────────────────────────────────────────────────────────
// A compact terminal ledger (under the MODE control) of saved analyses. Reads localStorage on
// mount + whenever `version` bumps (localStorage is not reactive). Rows: truncated title, integrity
// stamp with status word, keystone; actions REOPEN (restore into the store, no navigation),
// DUP (duplicate), DEL (delete). SSR-safe: initial render is the empty-state (listEntries() → []
// off-browser and before the mount effect), so there is no hydration mismatch.
const LIB_ACTION: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "2px 5px",
  border: "1px solid var(--hair-strong)",
  borderRadius: 0,
  background: "transparent",
  color: "var(--muted)",
  cursor: "pointer",
};

function LibrarySection({
  version = 0,
  currentEntryId = null,
  onReopen,
  onChange,
}: {
  version?: number;
  currentEntryId?: string | null;
  onReopen?: (id: string) => void;
  onChange?: () => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  // Re-read on mount and on every version bump (save / verdict update from the parent).
  // P2-T4: listEntries is now async (guest → local, signed-in → remote) — resolve inside the
  // effect. `cancelled` guards a state update after an unmount / rapid version bump.
  useEffect(() => {
    let cancelled = false;
    listEntries().then((all) => {
      if (!cancelled) setEntries(all);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  function refresh() {
    listEntries().then(setEntries);
  }

  // P2-T7 · SHARE toggle — signed-in only (remote entries have a real /d/<id> row to flip
  // is_public on). Copies the share link to the clipboard the moment it goes public.
  async function toggleShare(e: LibraryEntry) {
    const updated = await remoteSetPublic(e.id, !e.isPublic);
    if (!updated) return;
    refresh();
    onChange?.();
    if (updated.isPublic && typeof window !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/d/${updated.id}`);
      } catch {
        // clipboard permission denied / unavailable — the toggle still succeeded
      }
    }
  }

  return (
    <div data-testid="library-ledger">
      <span className="label" style={{ display: "block", marginBottom: 5 }}>
        Library
      </span>
      {entries.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--hair-strong)",
            borderRadius: 0,
            padding: "12px 10px",
            textAlign: "center",
          }}
        >
          <span className="label" style={{ letterSpacing: "0.14em", color: "var(--muted)" }}>
            No saved analyses
          </span>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--hair)", borderRadius: 0 }}>
          {entries.map((e) => {
            const word = statusWord(e.verdict.integrity);
            const active = e.id === currentEntryId;
            return (
              <div
                key={e.id}
                data-testid="library-row"
                data-entry-id={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--hair)",
                  background: active ? "var(--panel-2)" : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={e.title}
                  >
                    {e.title}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 2 }}>
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: statusAccent(word) }}
                    >
                      {Math.round(e.verdict.integrity)}% {word}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                      {e.verdict.keystoneId ?? "—"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    data-testid="library-reopen"
                    style={LIB_ACTION}
                    onClick={() => onReopen?.(e.id)}
                  >
                    Reopen
                  </button>
                  {getLibraryBackend() === "user" && (
                    <button
                      type="button"
                      data-testid="library-share"
                      style={LIB_ACTION}
                      title={e.isPublic ? "Turn off sharing" : "Share — copies /d/<id> once live"}
                      onClick={() => toggleShare(e)}
                    >
                      {e.isPublic ? "Unshare" : "Share"}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="library-duplicate"
                    style={LIB_ACTION}
                    onClick={async () => {
                      await duplicateEntry(e.id);
                      refresh();
                      onChange?.();
                    }}
                  >
                    Dup
                  </button>
                  <button
                    type="button"
                    data-testid="library-delete"
                    style={LIB_ACTION}
                    onClick={async () => {
                      await deleteEntry(e.id);
                      refresh();
                      onChange?.();
                    }}
                  >
                    Del
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ContextTab({
  onAnalyse,
  analysing,
  mode = "A",
  onModeChange,
  onGatherFindings,
  libraryVersion,
  currentEntryId,
  onReopen,
  onLibraryChange,
  onOpenGraph,
}: {
  onAnalyse: (input: ContextInput) => void;
  analysing: boolean;
  // Controlled by the parent (KeystoneApp holds the single source of truth so analyse()
  // can gate the scenario arg). Defaults to the pinned hero scenario.
  mode?: ContextMode;
  onModeChange?: (m: ContextMode) => void;
  /** V3-8: lifts each finished gather's facts so analyse() can ground extraction (V3-6). */
  onGatherFindings?: (kind: GatherKind, facts: GatherFinding[]) => void;
  /** V5-4: bumps to make the LIBRARY ledger re-read localStorage (save / verdict update). */
  libraryVersion?: number;
  /** V5-4: id of the snapshot the session is editing — highlighted in the ledger. */
  currentEntryId?: string | null;
  /** V5-4: restore a snapshot into the store (no navigation). */
  onReopen?: (id: string) => void;
  /** V5-4: the ledger mutated locally (duplicate / delete) — let the parent resync. */
  onLibraryChange?: () => void;
  /** C-3: jump to the GRAPH tab from the COMPILED strip's action. Omitted → the strip renders
   *  as a plain chip with no action (still additive/low-risk per the finding). */
  onOpenGraph?: () => void;
}) {
  const [active, setActive] = useState("business");
  // C-3: the compiled pack + its provenance — read straight off the store singleton so this
  // stays additive (no new props threaded down from KeystoneApp for the pack itself).
  const decisionContextPack = useKeystone((s) => s.decisionContextPack);
  const contextSource = useKeystone((s) => s.contextSource);

  // Textareas seed from the initial mode. Re-seeding on an explicit mode click happens in
  // `selectMode` (not via remount), so an edit-driven flip to CUSTOM preserves the user's text.
  const initial = seedFor(mode);
  const [businessContextText, setBusiness] = useState(initial.businessContextText);
  const [technicalContextText, setTechnical] = useState(initial.technicalContextText);
  const [temporalContextText, setTemporal] = useState(initial.temporalContextText);
  const [decisionText, setDecision] = useState(initial.decisionText);

  // Explicit segment click: re-seed the textareas from that mode's input (A/B pinned text,
  // CUSTOM blank) and report the mode up.
  function selectMode(next: ContextMode) {
    const s = seedFor(next);
    setBusiness(s.businessContextText);
    setTechnical(s.technicalContextText);
    setTemporal(s.temporalContextText);
    setDecision(s.decisionText);
    onModeChange?.(next);
  }

  // Any direct user edit while PINNED drops the scenario pin → CUSTOM. The text is left exactly
  // as typed (no re-seed), so their edit becomes the live custom starting point.
  function noteEdit() {
    if (onModeChange && mode !== "custom") onModeChange("custom");
  }
  function editing(set: (v: string) => void): (v: string) => void {
    return (v) => {
      set(v);
      noteEdit();
    };
  }

  const MANUAL: Record<GatherKind, { value: string; set: (v: string) => void }> = {
    business: { value: businessContextText, set: setBusiness },
    technical: { value: technicalContextText, set: setTechnical },
    temporal: { value: temporalContextText, set: setTemporal },
  };

  // One agent stream PER KIND, owned here (ContextTab stays mounted across sub-tab switches) so a
  // kind's log/findings — and any in-flight run — survive switching to another sub-tab and back.
  // Only the ACTIVE pane's AgentGather is mounted; it renders from the persisted stream for its
  // kind. Hooks are called unconditionally in a fixed order (React rules).
  const STREAMS: Record<GatherKind, UseAgentStream> = {
    business: useAgentStream(),
    technical: useAgentStream(),
    temporal: useAgentStream(),
  };

  // Renders the active kind's pane through the STABLE module-level ContextPane (see its comment
  // for why identity stability matters). Threads the raw setter (agent summaries, no edit-flip)
  // and the edit-wrapped setter (textarea keystrokes, flips the pin) separately.
  const renderPane = (kind: GatherKind) => {
    const manual = MANUAL[kind];
    return (
      <ContextPane
        kind={kind}
        mode={mode}
        stream={STREAMS[kind]}
        manualValue={manual.value}
        manualSet={manual.set}
        onManualEdit={editing(manual.set)}
        onGatherFindings={onGatherFindings}
      />
    );
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "var(--pad)",
        gap: "var(--gap)",
        overflowY: "auto",
        background: "var(--panel)",
      }}
    >
      {/* C-3 · additive — hidden until a compile has actually happened. */}
      {decisionContextPack && (
        <CompiledStrip pack={decisionContextPack} source={contextSource} onOpenGraph={onOpenGraph} />
      )}

      {onModeChange && <ModeSelect mode={mode} onSelect={selectMode} />}

      {/* V5-4 · LIBRARY ledger — compact list of saved analyses under the mode control. */}
      <LibrarySection
        version={libraryVersion}
        currentEntryId={currentEntryId}
        onReopen={onReopen}
        onChange={onLibraryChange}
      />

      <Tabs tabs={SUB_TABS} active={active} onChange={setActive} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {active === "business" && renderPane("business")}
        {active === "technical" && renderPane("technical")}
        {active === "temporal" && renderPane("temporal")}
        {active === "decision" && (
          <div style={{ maxWidth: 640 }}>
            <SectionHeader>Decision</SectionHeader>
            <Field
              label="Decision"
              value={decisionText}
              onChange={editing(setDecision)}
              rows={4}
              placeholder="What decision are you weighing?"
              mono={false}
            />
          </div>
        )}
      </div>

      {/* ── ANALYSE — runs the compile/extract pipeline on the four textareas ── */}
      <div style={{ borderTop: "1px solid var(--hair-strong)", paddingTop: "var(--gap)", display: "flex" }}>
        <Button
          primary
          disabled={analysing}
          onClick={() =>
            onAnalyse({ businessContextText, technicalContextText, temporalContextText, decisionText })
          }
          style={{ minWidth: 160, height: 38, letterSpacing: "0.14em" }}
        >
          {analysing ? "ANALYSING…" : "ANALYSE"}
        </Button>
      </div>
    </div>
  );
}
