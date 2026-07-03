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
import { useState } from "react";
import type { ContextInput, ScenarioId } from "@/context";
import { SCENARIOS } from "@/context/fixtures";
import type { GatherKind } from "@/agents/types";
import { AgentGather } from "@/ui/AgentGather";
import { Button, Field, SectionHeader, Tabs } from "@/ui/primitives";

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

const COL: React.CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--gap)" };
const PANE: React.CSSProperties = { display: "flex", gap: "var(--pad)", alignItems: "flex-start" };

// MODE selector — a terminal segmented control (NOT the Tabs primitive, so it carries no
// `data-tab`). A/B re-seed the textareas + pin the fixture chain; CUSTOM clears + goes live.
function ModeSelect({
  mode,
  onSelect,
}: {
  mode: ContextMode;
  onSelect: (m: ContextMode) => void;
}) {
  const segs: { id: ContextMode; label: string }[] = [
    { id: "A", label: SCENARIOS.A.label },
    { id: "B", label: SCENARIOS.B.label },
    { id: "custom", label: "C — Custom (Live)" },
  ];
  const segStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "8px 10px",
    fontFamily: "var(--mono)",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textAlign: "left",
    cursor: "pointer",
    border: "none",
    borderRadius: 0,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
  });
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
            style={segStyle(mode === s.id)}
          >
            {s.label}
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

export function ContextTab({
  onAnalyse,
  analysing,
  mode = "A",
  onModeChange,
}: {
  onAnalyse: (input: ContextInput) => void;
  analysing: boolean;
  // Controlled by the parent (KeystoneApp holds the single source of truth so analyse()
  // can gate the scenario arg). Defaults to the pinned hero scenario.
  mode?: ContextMode;
  onModeChange?: (m: ContextMode) => void;
}) {
  const [active, setActive] = useState("business");

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

  function ContextPane({ kind }: { kind: GatherKind }) {
    const manual = MANUAL[kind];
    return (
      <div style={PANE}>
        <div style={COL}>
          {/* Agent summaries layer onto the manual text but do NOT trip the edit-flip — only a
              direct user keystroke drops the scenario pin (V3-5 spec: "if the user EDITS"). */}
          <AgentGather kind={kind} onSummary={(s) => manual.set(mergeSummary(manual.value, s))} />
        </div>
        <div style={COL}>
          <SectionHeader>Manual</SectionHeader>
          <Field
            label={`${kind} context`}
            value={manual.value}
            onChange={editing(manual.set)}
            rows={12}
            placeholder="layer your own context on top of the agent summary…"
            mono={false}
          />
        </div>
      </div>
    );
  }

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
      {onModeChange && <ModeSelect mode={mode} onSelect={selectMode} />}

      <Tabs tabs={SUB_TABS} active={active} onChange={setActive} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {active === "business" && <ContextPane kind="business" />}
        {active === "technical" && <ContextPane kind="technical" />}
        {active === "temporal" && <ContextPane kind="temporal" />}
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
