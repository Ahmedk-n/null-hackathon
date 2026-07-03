"use client";
import { useState } from "react";
import type { Attack, Graph } from "@/engine";
import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
} from "@/store/useKeystone";
import { ContextTab } from "@/ui/tabs/ContextTab";
import { GraphTab } from "@/ui/tabs/GraphTab";
import { StressTab } from "@/ui/tabs/StressTab";
import { TopBar, Tabs, StatusStrip, Button, type TabDef } from "@/ui/primitives";

const TABS: TabDef[] = [
  { id: "context", label: "1 · Context" },
  { id: "graph", label: "2 · Graph" },
  { id: "stress", label: "3 · Stress" },
];

export default function KeystoneApp({
  startedAt,
  decision,
}: {
  startedAt: string;
  decision: string;
}) {
  const [activeTab, setActiveTab] = useState("context");
  const [building, setBuilding] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped by the TopBar FIT action → drives KeystoneCanvas.fitView via GraphTab.
  const [fitSignal, setFitSignal] = useState(0);

  const workingGraph = useKeystone((s) => s.workingGraph);
  const decisionContextPack = useKeystone((s) => s.decisionContextPack);
  const contextSource = useKeystone((s) => s.contextSource);
  const integrityValue = useKeystone(selectIntegrity);
  const keystoneId = useKeystone(selectKeystoneId);

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
      // Reveal sequencing: set the context pack first (Context Used surfaces),
      // then a short beat before the graph assembles on the canvas second.
      keystoneStore.getState().setContext(companyContext, pack, source);

      const exRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: input.decisionText, pack }),
      });
      const graph = (await exRes.json()) as Graph;
      await new Promise((resolve) => setTimeout(resolve, 800));
      keystoneStore.getState().setGraph(graph);
      setActiveTab("graph");
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

  // Bottom status strip: live reads of engine/store outputs.
  const statusItems = [
    { key: "Nodes", value: workingGraph ? workingGraph.nodes.length : "—" },
    { key: "Keystone", value: keystoneId ?? "—" },
    {
      key: "Integrity",
      value: workingGraph ? `${Math.round(integrityValue)}%` : "—",
      accent: !workingGraph
        ? undefined
        : integrityValue >= 60
          ? "var(--ok)"
          : integrityValue >= 35
            ? "var(--warn)"
            : "var(--bad)",
    },
    {
      key: "Source",
      value: contextSource ?? "—",
      accent: contextSource === "fixture" ? "var(--warn)" : undefined,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopBar
        title="▣ Keystone"
        subtitle={`Decision: "${decision}"`}
        timestamp={startedAt}
        actions={
          <>
            <Button onClick={() => setFitSignal((n) => n + 1)} title="Fit graph to view">
              Fit
            </Button>
            <Button onClick={() => keystoneStore.getState().reset()}>Reset</Button>
          </>
        }
      />

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {activeTab === "context" && <ContextTab onAnalyse={analyse} analysing={building} />}
        {activeTab === "graph" && <GraphTab fitSignal={fitSignal} />}
        {activeTab === "stress" && (
          <StressTab
            onApplyLoad={applyLoad}
            onReset={() => keystoneStore.getState().reset()}
            loading={loading}
          />
        )}
      </main>

      <StatusStrip items={statusItems} />
    </div>
  );
}
