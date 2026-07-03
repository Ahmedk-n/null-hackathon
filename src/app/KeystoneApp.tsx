"use client";
import { useRef, useState } from "react";
import type { Attack, Graph } from "@/engine";
import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import type { GatherFinding, GatherKind } from "@/agents/types";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
} from "@/store/useKeystone";
import { pickLayoutMode } from "@/canvas/layout";
import { analysisDepth } from "@/canvas/depth";
import { ContextTab, type ContextMode } from "@/ui/tabs/ContextTab";
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
  // Which mode the CONTEXT tab is driving. A (default) = the pinned hero migrate decision that
  // collapses; B = the pinned reinforce decision that holds; "custom" = the JUDGE mode — drop the
  // scenario pin so the live chain fires server-side (fixture fallback when no key). Held here
  // (not the store, which a concurrent agent owns) so the SAME mode plumbs through
  // context → extract → attacks. See src/ui/tabs/ContextTab.tsx.
  const [mode, setMode] = useState<ContextMode>("A");
  // Per-stage progress through the compile/extract/attacks chain, surfaced in the StatusStrip
  // using the plan's terminal vocabulary so a live run reads honestly, quietly.
  const [stage, setStage] = useState<"idle" | "context" | "extract" | "attacks" | "done">("idle");
  // Truthful per-stage provenance for THIS run. context comes from the /api/context body `source`;
  // extract/attacks read the additive `x-keystone-source` response header (V3-8, was inferred from
  // the context stage alone). null = the stage hasn't executed yet in this run.
  const [stageSource, setStageSource] = useState<{
    context: "live" | "fixture" | null;
    extract: "live" | "fixture" | null;
    attacks: "live" | "fixture" | null;
  }>({ context: null, extract: null, attacks: null });
  // Bumped by the TopBar FIT action → drives KeystoneCanvas.fitView via GraphTab.
  const [fitSignal, setFitSignal] = useState(0);
  // V3-8: facts lifted from finished gather runs (per kind). Extraction maps them into its
  // optional `findings` so live extraction grounds assumption confidences in evidence (V3-6).
  // A ref, not state — render never reads it; analyse() snapshots it at fetch time.
  const gatherFactsRef = useRef<Partial<Record<GatherKind, GatherFinding[]>>>({});

  // CUSTOM sends NO scenario (live path fires when a key exists); A/B pin the fixture chain.
  const scenarioArg = mode === "custom" ? undefined : mode;

  const workingGraph = useKeystone((s) => s.workingGraph);
  const decisionContextPack = useKeystone((s) => s.decisionContextPack);
  const integrityValue = useKeystone(selectIntegrity);
  const keystoneId = useKeystone(selectKeystoneId);

  // Orchestration reaches the model ONLY over HTTP — never imports server modules.
  async function analyse(input: ContextInput) {
    setBuilding(true);
    // Fresh run → clear last run's provenance (attacks stays null until Apply Load fires).
    setStageSource({ context: null, extract: null, attacks: null });
    try {
      // Stage 1 — COMPILE CONTEXT. Omit `scenario` entirely in CUSTOM mode (JSON.stringify drops
      // the undefined key) so the route's live branch can fire; A/B keep it and stay deterministic.
      setStage("context");
      const ctxRes = await fetch("/api/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, scenario: scenarioArg }),
      });
      const { companyContext, decisionContextPack: pack, source } = (await ctxRes.json()) as {
        companyContext: CompanyContext;
        decisionContextPack: DecisionContextPack;
        source: "live" | "fixture";
      };
      // Reveal sequencing: set the context pack first (Context Used surfaces),
      // then a short beat before the graph assembles on the canvas second.
      keystoneStore.getState().setContext(companyContext, pack, source);
      setStageSource((s) => ({ ...s, context: source }));

      // Stage 2 — EXTRACT STRUCTURE. Gathered facts ground the extraction's confidences:
      // GatherFinding {label,value,source} → ExtractFinding {source, fact}. Empty → omitted.
      const facts = Object.values(gatherFactsRef.current).flat();
      const findings = facts.length
        ? facts.map((f) => ({ source: f.source, fact: `${f.label}: ${f.value}` }))
        : undefined;
      setStage("extract");
      const exRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: input.decisionText, pack, scenario: scenarioArg, findings }),
      });
      const graph = (await exRes.json()) as Graph;
      setStageSource((s) => ({
        ...s,
        extract: exRes.headers.get("x-keystone-source") === "live" ? "live" : "fixture",
      }));
      await new Promise((resolve) => setTimeout(resolve, 800));
      keystoneStore.getState().setGraph(graph);
      setStage("done");
      setActiveTab("graph");
    } finally {
      setBuilding(false);
    }
  }

  async function applyLoad() {
    if (!workingGraph) return;
    setLoading(true);
    // Stage 3 — GENERATE ATTACKS (same scenario gating as the compile/extract stages).
    setStage("attacks");
    try {
      const res = await fetch("/api/attacks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          graph: workingGraph,
          pack: decisionContextPack ?? undefined,
          scenario: scenarioArg,
        }),
      });
      const { attacks: generated } = (await res.json()) as { attacks: Attack[] };
      setStageSource((s) => ({
        ...s,
        attacks: res.headers.get("x-keystone-source") === "live" ? "live" : "fixture",
      }));
      keystoneStore.getState().applyLoad(generated);
      setStage("done");
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
  // Per-stage progress in the plan's terminal vocabulary. Active during a live/fixture run,
  // then quiets to READY. This is the visible beat that makes a judge-typed run feel honest.
  const STAGE_LABEL: Record<typeof stage, string> = {
    idle: "READY",
    context: "COMPILING CONTEXT…",
    extract: "EXTRACTING STRUCTURE…",
    attacks: "GENERATING ATTACKS…",
    done: "READY",
  };
  const running = building || loading;
  // V4-1 — DEPTH: the dimensionality of the analysis (strata present + evidence
  // coverage). A judge reads "reasoned n/4 strata deep, m/k assumptions grounded."
  const depth = workingGraph ? analysisDepth(workingGraph) : null;
  // CUSTOM-mode chain provenance, now that EVERY stage reports a truthful source (context via body,
  // extract/attacks via the additive x-keystone-source header). We grade only the stages that have
  // executed this run: ALL live → LIVE CHAIN (--ok); some live, some fixture → PARTIAL naming the
  // first fixture stage (--warn); none live → FIXTURE; none executed yet → "—". A/B stay PINNED.
  function customSource(): { value: string; accent?: string } {
    const executed = (
      [
        ["CONTEXT", stageSource.context],
        ["EXTRACT", stageSource.extract],
        ["ATTACKS", stageSource.attacks],
      ] as const
    ).filter(([, s]) => s !== null);
    if (executed.length === 0) return { value: "—" };
    if (executed.every(([, s]) => s === "live")) return { value: "LIVE CHAIN", accent: "var(--ok)" };
    if (executed.some(([, s]) => s === "live")) {
      const firstFixture = executed.find(([, s]) => s === "fixture")![0];
      return { value: `PARTIAL (${firstFixture}: FIXTURE)`, accent: "var(--warn)" };
    }
    return { value: "FIXTURE" };
  }
  const sourceItem = mode !== "custom" ? { value: "PINNED" } : customSource();
  const statusItems = [
    {
      key: "Stage",
      value: STAGE_LABEL[stage],
      accent: running ? "var(--warn)" : undefined,
    },
    { key: "Nodes", value: workingGraph ? workingGraph.nodes.length : "—" },
    { key: "Links", value: linkCount ?? "—" },
    { key: "Mode", value: workingGraph ? pickLayoutMode(workingGraph.nodes.length) : "—" },
    { key: "Depth", value: depth ? `${depth.strata}/4` : "—" },
    {
      key: "Grounded",
      value: depth ? `${depth.grounded}/${depth.assumptions}` : "—",
      accent: !depth
        ? undefined
        : depth.assumptions > 0 && depth.grounded / depth.assumptions >= 0.6
          ? "var(--ok)"
          : "var(--warn)",
    },
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
      // Factual provenance, not an apology. A/B are PINNED (the deterministic demo). In CUSTOM the
      // strip grades the whole executed chain from each stage's truthful source (context body +
      // extract/attacks x-keystone-source header) — see customSource() above.
      value: sourceItem.value,
      accent: sourceItem.accent,
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
            mode={mode}
            onModeChange={setMode}
            onAnalyse={analyse}
            analysing={building}
            onGatherFindings={(kind, facts) => {
              gatherFactsRef.current[kind] = facts;
            }}
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
