"use client";
import { useState } from "react";
import type { Attack, Graph } from "@/engine";
import type { CompanyContext, ContextInput, DecisionContextPack, ScenarioId } from "@/context";
import { SCENARIOS } from "@/context/fixtures";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
} from "@/store/useKeystone";
import { pickLayoutMode } from "@/canvas/layout";
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
  // Which pre-filled scenario the CONTEXT tab is driving. A (default) = the hero
  // migrate decision that collapses; B = the reinforce decision that holds. Held here
  // (not the store) so the SAME id plumbs through context → extract → attacks.
  const [scenario, setScenario] = useState<ScenarioId>("A");
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
        body: JSON.stringify({ ...input, scenario }),
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
        body: JSON.stringify({ decision: input.decisionText, pack, scenario }),
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
        body: JSON.stringify({ graph: workingGraph, pack: decisionContextPack ?? undefined, scenario }),
      });
      const { attacks: generated } = (await res.json()) as { attacks: Attack[] };
      keystoneStore.getState().applyLoad(generated);
    } finally {
      setLoading(false);
    }
  }

  // Bottom status strip: live reads of engine/store outputs. LINKS = total edges
  // (child→parent) across the graph; MODE = the adaptive layout band the node count
  // selects (same pure classifier the canvas geometry uses).
  const linkCount = workingGraph
    ? workingGraph.nodes.reduce(
        (acc, n) => acc + n.groups.reduce((a, g) => a + g.childIds.length, 0),
        0,
      )
    : null;
  const statusItems = [
    { key: "Nodes", value: workingGraph ? workingGraph.nodes.length : "—" },
    { key: "Links", value: linkCount ?? "—" },
    { key: "Mode", value: workingGraph ? pickLayoutMode(workingGraph.nodes.length) : "—" },
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
      // Factual provenance, not an apology: LIVE (real compile) vs CACHED (offline/fixture).
      value: contextSource ? (contextSource === "live" ? "LIVE" : "CACHED") : "—",
      accent: contextSource === "live" ? "var(--ok)" : undefined,
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
        {activeTab === "context" && (
          <ContextTab
            key={scenario}
            scenario={scenario}
            onScenarioChange={setScenario}
            seed={SCENARIOS[scenario].input}
            onAnalyse={analyse}
            analysing={building}
          />
        )}
        {activeTab === "graph" && <GraphTab fitSignal={fitSignal} />}
        {activeTab === "stress" && (
          <StressTab
            onApplyLoad={applyLoad}
            onReset={() => keystoneStore.getState().reset()}
            onReinforce={() => keystoneStore.getState().reinforce()}
            loading={loading}
          />
        )}
      </main>

      <StatusStrip items={statusItems} />
    </div>
  );
}
