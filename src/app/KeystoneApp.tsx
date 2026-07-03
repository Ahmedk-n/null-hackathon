"use client";
import { useState } from "react";
import type { Attack, Graph } from "@/engine";
import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import { keystoneStore, useKeystone, selectIntegrity, selectKeystoneId, selectFailures } from "@/store/useKeystone";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { IntegrityGauge } from "@/ui/IntegrityGauge";
import { ConfidenceSlider } from "@/ui/ConfidenceSlider";
import { LoadPanel } from "@/ui/LoadPanel";
import { ContextPanel } from "@/ui/ContextPanel";
import { ContextUsedPanel } from "@/ui/ContextUsedPanel";
import { FIXTURE_DECISION } from "@/llm/fixture";

export default function KeystoneApp() {
  const [decision, setDecision] = useState(FIXTURE_DECISION);
  const [building, setBuilding] = useState(false);
  const [loading, setLoading] = useState(false);

  const workingGraph = useKeystone((s) => s.workingGraph);
  const loadApplied = useKeystone((s) => s.loadApplied);
  const attacks = useKeystone((s) => s.attacks);
  const decisionContextPack = useKeystone((s) => s.decisionContextPack);
  const contextSource = useKeystone((s) => s.contextSource);
  const integrityValue = useKeystone(selectIntegrity);
  const keystoneId = useKeystone(selectKeystoneId);
  const failures = useKeystone(selectFailures);

  // Orchestration reaches the model ONLY over HTTP — never imports server modules.
  async function analyse(input: ContextInput) {
    setBuilding(true);
    try {
      const ctxRes = await fetch("/api/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const { companyContext, decisionContextPack: pack, source } = (await ctxRes.json()) as {
        companyContext: CompanyContext;
        decisionContextPack: DecisionContextPack;
        source: "live" | "fixture";
      };
      keystoneStore.getState().setContext(companyContext, pack, source);

      const exRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: input.decisionText, pack }),
      });
      const graph = (await exRes.json()) as Graph;
      keystoneStore.getState().setGraph(graph);
    } finally {
      setBuilding(false);
    }
  }

  // Secondary base path: build a structure from just the decision text (no context pack).
  async function build() {
    setBuilding(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const graph = (await res.json()) as Graph;
      keystoneStore.getState().setGraph(graph);
    } finally {
      setBuilding(false);
    }
  }

  async function applyLoad() {
    if (!workingGraph) return;
    setLoading(true);
    try {
      const res = await fetch("/api/attacks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ graph: workingGraph, pack: decisionContextPack ?? undefined }),
      });
      const { attacks: generated } = (await res.json()) as { attacks: Attack[] };
      keystoneStore.getState().applyLoad(generated);
    } finally {
      setLoading(false);
    }
  }

  const assumptions = workingGraph?.nodes.filter((n) => n.type === "assumption") ?? [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", height: "100vh" }}>
      <aside style={{ padding: 16, borderRight: "1px solid #1b2230", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 22, letterSpacing: 2, margin: 0 }}>KEYSTONE</h1>

        <ContextPanel onAnalyse={analyse} building={building} />

        {decisionContextPack && contextSource && (
          <ContextUsedPanel pack={decisionContextPack} source={contextSource} />
        )}

        <details>
          <summary style={{ color: "#8b98a5", fontSize: 11, letterSpacing: 1.5, cursor: "pointer" }}>
            BUILD FROM DECISION ONLY
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <textarea
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              rows={3}
              style={{ width: "100%", background: "#0f1620", color: "#e6edf3", border: "1px solid #46525f", borderRadius: 8, padding: 8, boxSizing: "border-box" }}
            />
            <button onClick={build} disabled={building} style={{ padding: "10px 14px", background: "#1b2230", color: "#e6edf3", border: "1px solid #46525f", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
              {building ? "Building…" : "Build Structure"}
            </button>
          </div>
        </details>

        {workingGraph && (
          <>
            <IntegrityGauge value={integrityValue} />
            <div>
              <div style={{ color: "#8b98a5", fontSize: 11, letterSpacing: 1.5, marginBottom: 8 }}>ASSUMPTIONS</div>
              {assumptions.map((a) => (
                <ConfidenceSlider key={a.id} id={a.id} label={a.label} value={a.confidence} onChange={(id, v) => keystoneStore.getState().setConfidence(id, v)} />
              ))}
            </div>
            <LoadPanel onApplyLoad={applyLoad} onReset={() => keystoneStore.getState().reset()} loading={loading} loadApplied={loadApplied} attacks={attacks} />
          </>
        )}
      </aside>

      <section>
        {workingGraph ? (
          <KeystoneCanvas graph={workingGraph} keystoneId={keystoneId} failures={failures} />
        ) : (
          <div style={{ padding: 24, color: "#8b98a5" }}>Analyse a decision to begin.</div>
        )}
      </section>
    </div>
  );
}
