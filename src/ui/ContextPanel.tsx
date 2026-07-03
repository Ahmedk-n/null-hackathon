"use client";
import { useState } from "react";
import type { ContextInput } from "@/context";
import { HERO_CONTEXT_INPUT } from "@/context";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "#0f1620",
  color: "#e6edf3",
  border: "1px solid #46525f",
  borderRadius: 8,
  padding: 8,
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: 12,
  resize: "vertical",
};

const labelStyle: React.CSSProperties = {
  color: "#8b98a5",
  fontSize: 11,
  letterSpacing: 1.5,
  marginBottom: 4,
  display: "block",
};

export function ContextPanel({
  onAnalyse,
  building,
}: {
  onAnalyse: (input: ContextInput) => void;
  building: boolean;
}) {
  const [businessContextText, setBusiness] = useState(HERO_CONTEXT_INPUT.businessContextText);
  const [technicalContextText, setTechnical] = useState(HERO_CONTEXT_INPUT.technicalContextText);
  const [temporalContextText, setTemporal] = useState(HERO_CONTEXT_INPUT.temporalContextText);
  const [decisionText, setDecision] = useState(HERO_CONTEXT_INPUT.decisionText);

  function analyse() {
    onAnalyse({ businessContextText, technicalContextText, temporalContextText, decisionText });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: "#8b98a5", fontSize: 11, letterSpacing: 1.5 }}>CONTEXT</div>

      <div>
        <label style={labelStyle}>BUSINESS CONTEXT</label>
        <textarea value={businessContextText} onChange={(e) => setBusiness(e.target.value)} rows={3} style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>TECHNICAL CONTEXT</label>
        <textarea value={technicalContextText} onChange={(e) => setTechnical(e.target.value)} rows={3} style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>TEMPORAL CONTEXT</label>
        <textarea value={temporalContextText} onChange={(e) => setTemporal(e.target.value)} rows={3} style={fieldStyle} />
      </div>
      <div>
        <label style={labelStyle}>DECISION</label>
        <textarea value={decisionText} onChange={(e) => setDecision(e.target.value)} rows={2} style={fieldStyle} />
      </div>

      <button
        onClick={analyse}
        disabled={building}
        style={{
          padding: "10px 14px",
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: 700,
          cursor: building ? "default" : "pointer",
        }}
      >
        {building ? "Analysing…" : "Analyse"}
      </button>
    </div>
  );
}
