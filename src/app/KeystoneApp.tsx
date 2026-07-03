"use client";
import { useState } from "react";
import type { Attack, Graph } from "@/engine";
import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
  selectFailures,
} from "@/store/useKeystone";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { LoadPanel } from "@/ui/LoadPanel";
import { ContextPanel } from "@/ui/ContextPanel";
import { ContextUsedPanel } from "@/ui/ContextUsedPanel";
import { GraphTab } from "@/ui/tabs/GraphTab";
import {
  TopBar,
  Tabs,
  StatusStrip,
  Button,
  SectionHeader,
  LedgerRow,
  type TabDef,
} from "@/ui/primitives";

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
  // Bumped by the TopBar FIT action → drives KeystoneCanvas.fitView.
  const [fitSignal, setFitSignal] = useState(0);

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
      // Reveal sequencing: surface the Context Used panel first (it fades in),
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
      accent:
        !workingGraph
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
        {activeTab === "context" && (
          <ContextTab
            onAnalyse={analyse}
            building={building}
            pack={decisionContextPack}
            source={contextSource}
            decision={decision}
            startedAt={startedAt}
          />
        )}
        {activeTab === "graph" && <GraphTab fitSignal={fitSignal} />}
        {activeTab === "stress" && (
          <StressTab
            graph={workingGraph}
            keystoneId={keystoneId}
            failures={failures}
            onApplyLoad={applyLoad}
            loading={loading}
            loadApplied={loadApplied}
            attacks={attacks}
          />
        )}
      </main>

      <StatusStrip items={statusItems} />
    </div>
  );
}

// ── Tab panes (R1: wrap the existing pieces so the app stays functional) ──

const RAIL: React.CSSProperties = {
  width: 360,
  minWidth: 360,
  borderRight: "1px solid var(--hair)",
  padding: "var(--pad)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "var(--gap)",
  background: "var(--panel)",
};

function ContextTab({
  onAnalyse,
  building,
  pack,
  source,
  decision,
  startedAt,
}: {
  onAnalyse: (input: ContextInput) => void;
  building: boolean;
  pack: DecisionContextPack | null;
  source: "live" | "fixture" | null;
  decision: string;
  startedAt: string;
}) {
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={RAIL}>
        <SectionHeader>Session</SectionHeader>
        <div>
          <LedgerRow label="Decision" value={decision} />
          <LedgerRow label="Started" value={startedAt} />
          <LedgerRow label="Source" value={source ?? "—"} accent={source === "fixture" ? "var(--warn)" : undefined} />
        </div>
        <ContextPanel onAnalyse={onAnalyse} building={building} />
      </div>
      <div style={{ flex: 1, padding: "var(--pad)", overflowY: "auto" }}>
        <SectionHeader>Context Used</SectionHeader>
        {pack && source ? (
          <ContextUsedPanel pack={pack} source={source} />
        ) : (
          <div className="label" style={{ marginTop: 8 }}>
            Analyse a decision to populate the context pack.
          </div>
        )}
      </div>
    </div>
  );
}

function StressTab({
  graph,
  keystoneId,
  failures,
  onApplyLoad,
  loading,
  loadApplied,
  attacks,
}: {
  graph: Graph | null;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
  onApplyLoad: () => void;
  loading: boolean;
  loadApplied: boolean;
  attacks: Attack[];
}) {
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={RAIL}>
        <SectionHeader>Attack Ledger</SectionHeader>
        {graph ? (
          <LoadPanel
            onApplyLoad={onApplyLoad}
            onReset={() => keystoneStore.getState().reset()}
            loading={loading}
            loadApplied={loadApplied}
            attacks={attacks}
          />
        ) : (
          <div className="label">Analyse a decision before applying load.</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {graph ? (
          <KeystoneCanvas graph={graph} keystoneId={keystoneId} failures={failures} />
        ) : (
          <div className="label" style={{ padding: "var(--pad)" }}>
            No structure to stress yet.
          </div>
        )}
      </div>
    </div>
  );
}
