"use client";
import type { DecisionContextPack, WeightCategory } from "@/context";

const MUTED = "#8b98a5";
const AMBER = "#f59e0b";

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

function FactList({ title, items, accent }: { title: string; items: string[]; accent?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div style={{ color: accent ?? MUTED, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: "#e6edf3", fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it, i) => (
          <li key={i} style={accent ? { color: accent } : undefined}>
            {it}
          </li>
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
  const adjustments = pack.contextWeightAdjustments
    .slice()
    .sort((a, b) => b.magnitude - a.magnitude);

  return (
    <section
      style={{
        background: "#0d1117",
        border: "1px solid #1b2230",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1.5, flex: 1 }}>CONTEXT USED</div>
        {source === "fixture" && (
          <span
            style={{
              fontSize: 10,
              color: AMBER,
              border: `1px solid ${AMBER}`,
              borderRadius: 999,
              padding: "1px 8px",
              whiteSpace: "nowrap",
            }}
          >
            ⚠ demo fallback
          </span>
        )}
      </div>

      <FactList title="Business facts" items={pack.relevantBusinessFacts} />
      <FactList title="Technical facts" items={pack.relevantTechnicalFacts} />
      <FactList title="Temporal facts" items={pack.relevantTemporalFacts} accent={AMBER} />

      <div>
        <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>
          How this changed the analysis
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {adjustments.map((w) => {
            const increase = w.direction === "increase";
            const color = increase ? AMBER : MUTED;
            return (
              <div key={w.targetCategory + w.reason} style={{ fontSize: 12, color: "#e6edf3", display: "flex", gap: 6 }}>
                <span style={{ color }}>{increase ? "▲" : "▼"}</span>
                <span>
                  <span style={{ color, fontWeight: 600 }}>
                    {increase ? "Increased" : "Decreased"} weight on {CATEGORY_LABEL[w.targetCategory]}
                  </span>
                  {" — "}
                  {w.reason}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {pack.missingInformation.length > 0 && (
        <FactList title="Missing information" items={pack.missingInformation} />
      )}
    </section>
  );
}
