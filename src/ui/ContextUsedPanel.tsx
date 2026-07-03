"use client";
// CONTEXT USED panel — ledger re-skin (plan §2 / §1). Same props/data binding as before
// (StressTab consumes it): { pack, source }. Shows the relevant business/technical/temporal
// facts, the weight adjustments that reshaped the analysis (magnitude-sorted, ▲ increase /
// ▼ decrease), missing information, and a demo-fallback chip when the pack is fixture data.
import type { DecisionContextPack, WeightCategory } from "@/context";
import { Chip, LedgerRow, SectionHeader } from "@/ui/primitives";

const CATEGORY_LABEL: Record<WeightCategory, string> = {
  market: "market",
  execution: "execution",
  technical: "technical",
  competitor: "competitor",
  opportunity_cost: "opportunity cost",
  timeline: "timeline",
  reliability: "reliability",
  auditability: "auditability",
};

// A ledger-styled bullet list of facts. `accent` recolours the marker + text
// (temporal facts render amber, matching the graph's temporal accent).
function FactList({ title, items, accent }: { title: string; items: string[]; accent?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <ul
        style={{
          margin: 0,
          paddingLeft: 16,
          color: accent ?? "var(--ink)",
          fontSize: 12,
          lineHeight: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function ContextUsedPanel({
  pack,
  source,
}: {
  pack: DecisionContextPack;
  source: "live" | "fixture";
}) {
  const adjustments = pack.contextWeightAdjustments.slice().sort((a, b) => b.magnitude - a.magnitude);

  return (
    <section
      className="panel"
      style={{
        border: "1px solid var(--hair)",
        padding: "var(--pad)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--gap)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SectionHeader>Context Used</SectionHeader>
        <div style={{ flex: 1 }} />
        {source === "fixture" && <Chip tone="warn">⚠ demo fallback</Chip>}
      </div>

      <FactList title="Business facts" items={pack.relevantBusinessFacts} />
      <FactList title="Technical facts" items={pack.relevantTechnicalFacts} />
      <FactList title="Temporal facts" items={pack.relevantTemporalFacts} accent="var(--increase)" />

      <div>
        <SectionHeader>How this changed the analysis</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {adjustments.map((w) => {
            const increase = w.direction === "increase";
            const color = increase ? "var(--increase)" : "var(--decrease)";
            return (
              <div key={w.targetCategory + w.reason}>
                <LedgerRow
                  label={CATEGORY_LABEL[w.targetCategory]}
                  value={`${increase ? "▲" : "▼"} ${w.magnitude.toFixed(2)}`}
                  accent={color}
                />
                <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>{w.reason}</div>
              </div>
            );
          })}
        </div>
      </div>

      {pack.missingInformation.length > 0 && (
        <FactList title="Missing information" items={pack.missingInformation} accent="var(--muted)" />
      )}
    </section>
  );
}
