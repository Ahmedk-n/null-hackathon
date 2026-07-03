"use client";
// Tab 1 — CONTEXT (plan §2.1). Inner sub-tabs BUSINESS · TECHNICAL · TEMPORAL · DECISION.
// Each of the first three = LEFT <AgentGather/> + RIGHT a MANUAL textarea (seeded from
// HERO_CONTEXT_INPUT, appended when the agent emits a summary). DECISION = one textarea.
// The four textareas compose the ContextInput handed to onAnalyse.
import { useState } from "react";
import type { ContextInput } from "@/context";
import { HERO_CONTEXT_INPUT } from "@/context";
import type { GatherKind } from "@/agents/types";
import { AgentGather } from "@/ui/AgentGather";
import { Button, Field, SectionHeader, Tabs } from "@/ui/primitives";

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

export function ContextTab({
  onAnalyse,
  analysing,
}: {
  onAnalyse: (input: ContextInput) => void;
  analysing: boolean;
}) {
  const [active, setActive] = useState("business");

  const [businessContextText, setBusiness] = useState(HERO_CONTEXT_INPUT.businessContextText);
  const [technicalContextText, setTechnical] = useState(HERO_CONTEXT_INPUT.technicalContextText);
  const [temporalContextText, setTemporal] = useState(HERO_CONTEXT_INPUT.temporalContextText);
  const [decisionText, setDecision] = useState(HERO_CONTEXT_INPUT.decisionText);

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
          <AgentGather kind={kind} onSummary={(s) => manual.set(mergeSummary(manual.value, s))} />
        </div>
        <div style={COL}>
          <SectionHeader>Manual</SectionHeader>
          <Field
            label={`${kind} context`}
            value={manual.value}
            onChange={manual.set}
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
              onChange={setDecision}
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
