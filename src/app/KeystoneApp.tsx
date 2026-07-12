"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Attack, Graph } from "@/engine";
import { integrity } from "@/engine";
import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import type { GatherFinding, GatherKind } from "@/agents/types";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
} from "@/store/useKeystone";
// V5-4 · decision library (localStorage snapshot layer). Pure client module — no wall-clock,
// no server imports (types only), SSR-safe. See src/lib/library.ts.
import {
  saveEntry,
  updateEntryVerdict,
  getEntry,
  type LibraryEntry,
  type LibraryVerdict,
} from "@/lib/library";
import { pickLayoutMode } from "@/canvas/layout";
import { analysisDepth } from "@/canvas/depth";
import { ContextTab, type ContextMode } from "@/ui/tabs/ContextTab";
import { DesignTab, type OpenCandidate } from "@/ui/tabs/DesignTab";
import { GraphTab } from "@/ui/tabs/GraphTab";
import { StressTab } from "@/ui/tabs/StressTab";
import { TopBar, Tabs, StatusStrip, Button, type TabDef } from "@/ui/primitives";
// P2-T6 · account menu + the session hook. useSession() is what actually flips the library
// backend (setLibraryBackend) on every auth-state change — see src/lib/useSession.ts. AccountMenu
// also subscribes on its own (so it works if mounted elsewhere too); both calls are cheap/idempotent.
import { AccountMenu } from "@/ui/AccountMenu";
import { useSession } from "@/lib/useSession";
// LIVE PIPELINE — the dismissable "system at work" overlay. Mounts while a run is in flight and
// reflects the REAL run (stage + stageSource + the store's graph/attacks + the pure engine MATH).
import { LivePipeline } from "@/ui/pipeline/LivePipeline";
// V6-1 · design OPEN IN STUDIO seeds the studio store with scenario R's context (pure fixtures,
// deep path — never the @/context barrel, so the key-safety boundary stays green).
import { fixtureCompanyContextR, fixtureDecisionContextPackR, SCENARIOS } from "@/context/fixtures";

// V6-1 · TABS = 0·DESIGN → 1·CONTEXT → 2·GRAPH → 3·STRESS. DESIGN leads the workflow, but CONTEXT
// stays the INITIAL activeTab (below) so the pinned demo flow is unchanged (deliberate).
const TABS: TabDef[] = [
  { id: "design", label: "0 · Design" },
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
  // Whether the LIVE PIPELINE overlay is showing. Turned on when a run STARTS (analyse / applyLoad);
  // the overlay turns itself off (auto-dismiss on real `stage==="done"` after a min beat, or SKIP).
  // Dismissing NEVER cancels the run — the fetch chain continues independently in the background.
  const [showPipeline, setShowPipeline] = useState(false);
  // Which mode the CONTEXT tab is driving. R (default) = the REAL sample — Excalidraw, generated
  // live from the actual repo/site and pinned; A = the hero migrate decision that collapses;
  // B = the reinforce decision that holds; "custom" = the JUDGE mode — drop the scenario pin so
  // the live chain fires server-side (fixture fallback when no key). Held here so the SAME mode
  // plumbs through context → extract → attacks. See src/ui/tabs/ContextTab.tsx.
  const [mode, setMode] = useState<ContextMode>("R");
  // Per-stage progress through the compile/extract/attacks chain, surfaced in the StatusStrip
  // using the plan's terminal vocabulary so a live run reads honestly, quietly. "error" (L-1) marks
  // a run that threw or returned non-OK — see analyse()/applyLoad() catch blocks below.
  const [stage, setStage] = useState<"idle" | "context" | "extract" | "attacks" | "done" | "error">(
    "idle",
  );
  // L-1 · the last run's failure, human-readable, or null between/after a clean run. Drives the
  // dismissible --bad banner below <Tabs>. Cleared at the start of every run and on reset() calls
  // (see the Reset button / StressTab onReset wrappers) so a stale banner never lingers.
  const [runError, setRunError] = useState<string | null>(null);
  // L-1 · which run the banner's RETRY should re-invoke ("analyse" replays the stashed input via
  // lastAnalyseInputRef; "applyLoad" takes no args). null while no run has failed yet.
  const [lastRunKind, setLastRunKind] = useState<"analyse" | "applyLoad" | null>(null);
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
  // L-1 · the last analyse() input, stashed so the error banner's RETRY can re-invoke the same run
  // without the user re-typing the form. null until the first analyse() call. Not state — retrying
  // doesn't need a render, and it must survive past a failed run.
  const lastAnalyseInputRef = useRef<ContextInput | null>(null);

  // V5-4 · the library entry THIS session is editing. analyse() creates one; Apply Load / Reinforce
  // patch its verdict; reopening a snapshot adopts its id. null = nothing saved yet this session.
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  // Bumped whenever the library changes (save / verdict update / restore) so the CONTEXT-tab
  // LIBRARY ledger re-reads localStorage. localStorage is not reactive; this is the refresh beat.
  const [libraryVersion, setLibraryVersion] = useState(0);

  // P2-T6 · mounting the session hook here (in addition to inside <AccountMenu/>) guarantees the
  // library backend flips to "user"/"guest" on every auth-state change even if AccountMenu is ever
  // reworked/removed from the TopBar — see src/lib/useSession.ts (setLibraryBackend call).
  useSession();

  // CUSTOM sends NO scenario (live path fires when a key exists); A/B pin the fixture chain.
  const scenarioArg = mode === "custom" ? undefined : mode;

  const workingGraph = useKeystone((s) => s.workingGraph);
  const baseGraph = useKeystone((s) => s.baseGraph);
  const decisionContextPack = useKeystone((s) => s.decisionContextPack);
  const integrityValue = useKeystone(selectIntegrity);
  const keystoneId = useKeystone(selectKeystoneId);
  // Footer integrity is tab-aware: STRESS shows the live post-load session verdict; every other
  // tab (CONTEXT/DESIGN/GRAPH) shows the STANDING baseline, so the strip never contradicts the
  // GRAPH tab's own standing ledger (which reads baseGraph).
  const footerIntegrity =
    activeTab === "stress" ? integrityValue : baseGraph ? integrity(baseGraph) : integrityValue;

  // V5-4 · the current live verdict SUMMARY, read straight off the store (post-engine). Used to
  // stamp a new snapshot and to patch it after Apply Load / Reinforce.
  function currentVerdict(): LibraryVerdict {
    const s = keystoneStore.getState();
    return {
      integrity: selectIntegrity(s),
      keystoneId: selectKeystoneId(s),
      failedIds: [...s.failures],
      loadApplied: s.loadApplied,
    };
  }

  // Patch the current snapshot's verdict in place (Apply Load / Reinforce) + refresh the ledger.
  // P2-T4: updateEntryVerdict is now async (guest → local, signed-in → remote) — await it.
  async function syncCurrentVerdict() {
    if (!currentEntryId) return;
    await updateEntryVerdict(currentEntryId, currentVerdict());
    setLibraryVersion((n) => n + 1);
  }

  // V5-4 · restore a saved snapshot into the store WITHOUT calling the API: rehydrate the context
  // pack (so Context Used surfaces), set the graph (the engine re-verdicts from it), adopt the mode
  // and the entry id, and jump to the GRAPH tab. Shared by the ?open=<id> deep link and the
  // in-studio LIBRARY reopen action.
  function restoreEntry(entry: LibraryEntry) {
    const store = keystoneStore.getState();
    if (entry.companyContext && entry.pack) {
      store.setContext(entry.companyContext, entry.pack, "fixture");
    }
    store.setGraph(entry.graph);
    setMode(entry.mode);
    setCurrentEntryId(entry.id);
    setActiveTab("graph");
  }

  // V6-1 · OPEN IN STUDIO — seed the studio from a DESIGN-tab tournament candidate: keep the
  // scenario-R context pack (Context Used surfaces + grounds the load), set the winning graph, and
  // apply its attacks as rawAttacks (the grounded verdict the tournament just showed). Auto-save the
  // snapshot and jump to the GRAPH tab. No API round-trip — everything is client-side + pure.
  // P2-T4: saveEntry is now async — await it (openInStudio itself becomes async; its caller,
  // DesignTab's onOpenInStudio, accepts a void-returning handler so the Promise is fire-and-forget
  // from the caller's perspective, same as before).
  async function openInStudio(c: OpenCandidate) {
    const store = keystoneStore.getState();
    const companyContext = fixtureCompanyContextR();
    const pack = fixtureDecisionContextPackR();
    store.setContext(companyContext, pack, "fixture");
    store.setGraph(c.graph); // clean base + working; clears prior attacks
    store.applyLoad(c.attacks); // seeds rawAttacks + the grounded, reweighted verdict
    const entry = await saveEntry({
      title: c.label,
      savedAtISO: startedAt,
      mode: "R",
      input: SCENARIOS.R.input,
      companyContext,
      pack,
      graph: c.graph,
      verdict: currentVerdict(),
      predictedPHold: keystoneStore.getState().probabilistic?.pHold ?? null,
    });
    if (entry) {
      setCurrentEntryId(entry.id);
      setLibraryVersion((n) => n + 1);
    }
    setMode("R");
    setActiveTab("graph");
  }

  // V5-4 · deep link: /studio?open=<id> restores that snapshot on mount. Read window.location
  // in an effect (client-only, SSR-safe) rather than useSearchParams — this keeps the studio page
  // free of a Suspense boundary and the shell render tests free of a router-context mock, while
  // still honouring "reopen anywhere". Runs once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id) return;
    // P2-T4: getEntry is now async — resolve inside the effect (still runs once on mount).
    let cancelled = false;
    getEntry(id).then((entry) => {
      if (!cancelled && entry) restoreEntry(entry);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orchestration reaches the model ONLY over HTTP — never imports server modules.
  async function analyse(input: ContextInput) {
    lastAnalyseInputRef.current = input;
    setLastRunKind("analyse");
    setBuilding(true);
    setShowPipeline(true);
    // Fresh run → clear last run's provenance (attacks stays null until Apply Load fires) AND any
    // stale failure banner from a prior run (L-1).
    setStageSource({ context: null, extract: null, attacks: null });
    setRunError(null);
    try {
      // The gathered rich findings snapshotted for THIS run. Fed into BOTH stages: the compiler
      // (V8-C1, so the pack is grounded in real multi-source research) and extraction (grounds
      // assumption confidences). Pure map — no client wall-clock/random.
      const facts = Object.values(gatherFactsRef.current).flat();
      // V8-C1 · GatherFinding → the plain ContextFinding shape the compiler expects (rich fields
      // carried through: excerpt, quantities, entities, date, implication). Empty → omitted so the
      // route/compiler behave exactly as before.
      const contextFindings = facts.length
        ? facts.map((f) => ({
            source: f.source,
            label: f.label,
            value: f.value,
            sourceExcerpt: f.sourceExcerpt,
            quantities: f.quantities,
            entities: f.entities,
            dateISO: f.dateISO,
            implication: f.implication,
          }))
        : undefined;
      // Stage 1 — COMPILE CONTEXT. Omit `scenario` entirely in CUSTOM mode (JSON.stringify drops
      // the undefined key) so the route's live branch can fire; A/B keep it and stay deterministic.
      setStage("context");
      const ctxRes = await fetch("/api/context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, scenario: scenarioArg, findings: contextFindings }),
      });
      if (!ctxRes.ok) throw new Error(`/api/context failed (${ctxRes.status})`);
      const { companyContext, decisionContextPack: pack, source } = (await ctxRes.json()) as {
        companyContext: CompanyContext;
        decisionContextPack: DecisionContextPack;
        source: "live" | "fixture";
      };
      // Reveal sequencing: set the context pack first (Context Used surfaces),
      // then a short beat before the graph assembles on the canvas second.
      keystoneStore.getState().setContext(companyContext, pack, source);
      setStageSource((s) => ({ ...s, context: source }));

      // Stage 2 — EXTRACT STRUCTURE. Gathered facts ground the extraction's confidences.
      // GatherFinding → ExtractFinding {source, fact, excerpt?}.
      // V7-5: fold detail + quantified specifics into the fact so the model extracts against the
      // FULL research, not just the headline (was dropping detail/specifics). Empty → omitted.
      // V8-C3: thread the VERBATIM sourceExcerpt so node evidence can cite the actual source words
      // instead of a paraphrase. `fact` stays the informative summary; `excerpt` carries the quote.
      // (`facts` was snapshotted above for the compiler; reuse the same snapshot here.)
      const findings = facts.length
        ? facts.map((f) => {
            const parts = [`${f.label}: ${f.value}`];
            if (f.detail) parts.push(f.detail);
            if (f.specifics && f.specifics.length > 0) parts.push(`specifics: ${f.specifics.join("; ")}`);
            return { source: f.source, fact: parts.join(" — "), excerpt: f.sourceExcerpt };
          })
        : undefined;
      setStage("extract");
      const exRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: input.decisionText, pack, scenario: scenarioArg, findings }),
      });
      if (!exRes.ok) throw new Error(`/api/extract failed (${exRes.status})`);
      const graph = (await exRes.json()) as Graph;
      setStageSource((s) => ({
        ...s,
        extract: exRes.headers.get("x-keystone-source") === "live" ? "live" : "fixture",
      }));
      await new Promise((resolve) => setTimeout(resolve, 800));
      keystoneStore.getState().setGraph(graph);
      // V5-4 · auto-save the analysis. savedAtISO = the server-passed startedAt (NEVER a client
      // clock — T8); seq/id come from the library's persisted monotonic counter. The verdict is
      // the fresh (pre-load) engine reading off the just-set graph.
      // P2-T4: saveEntry is now async — `analyse` is already an async function, so just await it.
      const entry = await saveEntry({
        title: input.decisionText.trim() || decision,
        savedAtISO: startedAt,
        mode,
        input,
        companyContext,
        pack,
        graph,
        verdict: currentVerdict(),
        predictedPHold: keystoneStore.getState().probabilistic?.pHold ?? null,
      });
      if (entry) {
        setCurrentEntryId(entry.id);
        setLibraryVersion((n) => n + 1);
      }
      setStage("done");
      setActiveTab("graph");
    } catch (err) {
      // L-1 · a thrown non-OK response or a network/parse failure. Surface it honestly and drop
      // the stalled pipeline overlay — it would otherwise sit on "COMPILING CONTEXT…"/"EXTRACTING
      // STRUCTURE…" forever since `stage` never reaches "done".
      setStage("error");
      setRunError(err instanceof Error ? err.message : "analyse failed");
      setShowPipeline(false);
    } finally {
      setBuilding(false);
    }
  }

  async function applyLoad() {
    if (!workingGraph) return;
    setLastRunKind("applyLoad");
    setLoading(true);
    setShowPipeline(true);
    // Stage 3 — GENERATE ATTACKS (same scenario gating as the compile/extract stages).
    setStage("attacks");
    setRunError(null); // fresh run → clear any stale failure banner (L-1)
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
      if (!res.ok) throw new Error(`/api/attacks failed (${res.status})`);
      const { attacks: generated } = (await res.json()) as { attacks: Attack[] };
      setStageSource((s) => ({
        ...s,
        attacks: res.headers.get("x-keystone-source") === "live" ? "live" : "fixture",
      }));
      keystoneStore.getState().applyLoad(generated);
      // V5-4 · the applied-load verdict updates the current snapshot in the library.
      await syncCurrentVerdict();
      setStage("done");
    } catch (err) {
      // L-1 · same treatment as analyse(): honest failure + drop the stalled overlay so
      // "GENERATING ATTACKS…" can't hang forever.
      setStage("error");
      setRunError(err instanceof Error ? err.message : "apply load failed");
      setShowPipeline(false);
    } finally {
      setLoading(false);
    }
  }

  // L-1 · re-invoke whichever run last failed. analyse() replays the stashed input (form state
  // itself lives in ContextTab, not here); applyLoad() takes no args and just re-reads the
  // current workingGraph. No-op if nothing has run yet (defensive — the banner can't render
  // without lastRunKind being set first).
  function retryLastRun() {
    if (lastRunKind === "analyse" && lastAnalyseInputRef.current) {
      void analyse(lastAnalyseInputRef.current);
    } else if (lastRunKind === "applyLoad") {
      void applyLoad();
    }
  }

  // V5-4 · Reinforce runs the store solver, then patches the snapshot's verdict (de-risked).
  async function handleReinforce() {
    keystoneStore.getState().reinforce();
    await syncCurrentVerdict();
  }

  // L-1 · clear the failure banner AND retire the "error" Stage indicator together, so dismissing
  // the banner doesn't leave the StatusStrip "Stage" cell stuck reading RUN FAILED in --bad. Safe:
  // on error the run has already finished (finally cleared building/loading), so "idle" (→ READY)
  // is the correct resting stage.
  function clearRunError() {
    setRunError(null);
    setStage((s) => (s === "error" ? "idle" : s));
  }

  // L-1 · store reset() only clears engine/store state — it has no idea runError exists (this
  // state lives here, not in the store). Wrap it so a stale failure banner never survives a Reset.
  function handleReset() {
    keystoneStore.getState().reset();
    clearRunError();
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
    error: "RUN FAILED",
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
      // L-1: a failed run reads --bad here even though `running` is already false (finally already
      // flipped it) — same honest-status treatment as the Integrity/Grounded items below.
      accent: stage === "error" ? "var(--bad)" : running ? "var(--warn)" : undefined,
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
      value: workingGraph ? `${Math.round(footerIntegrity)}%` : "—",
      accent: !workingGraph
        ? undefined
        : footerIntegrity >= 60
          ? "var(--ok)"
          : footerIntegrity >= 35
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
        subtitle={decision}
        timestamp={startedAt}
        actions={
          <>
            {/* V6-1 · SKYLINE — the whole library rendered as one assembly (V6-3). */}
            <Link href="/skyline" className="btn" style={{ textDecoration: "none" }}>
              Skyline
            </Link>
            <Button onClick={() => setFitSignal((n) => n + 1)} title="Fit graph to view">
              Fit
            </Button>
            <Button onClick={handleReset}>Reset</Button>
            {/* V5-2 — PRINT MEMO: SPA Link (preserves the in-memory store) to the
                drawing-sheet memo. Disabled-looking until a verdict exists. */}
            {workingGraph ? (
              <Link href="/studio/memo" className="btn" style={{ textDecoration: "none" }}>
                Print Memo
              </Link>
            ) : (
              <Button disabled>Print Memo</Button>
            )}
            {/* P2-T6 · account/session widget — LOADING / GUEST ("Sign in to save") / SIGNED IN. */}
            <AccountMenu />
          </>
        }
      />

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* L-1 · RUN FAILED banner — the honest, dismissible affordance for a run that threw or came
          back non-OK (analyse()/applyLoad() catch blocks above). Additive: renders nothing while
          runError is null, so the happy path is pixel-identical to before. Placed under <Tabs> so
          it's the first thing in view regardless of which tab is active. */}
      {runError && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--gap)",
            padding: "8px var(--pad)",
            borderBottom: "1px solid var(--bad)",
            background: "var(--bad-bg)",
          }}
        >
          <span className="label" style={{ color: "var(--bad)" }}>
            Run Failed
          </span>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink)", flex: 1, minWidth: 0 }}>
            {runError} — the run did not complete; re-run when ready.
          </span>
          {(lastRunKind === "applyLoad" || (lastRunKind === "analyse" && lastAnalyseInputRef.current)) && (
            <Button onClick={retryLastRun}>Retry</Button>
          )}
          <Button onClick={clearRunError} title="Dismiss">
            ×
          </Button>
        </div>
      )}

      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {activeTab === "design" && <DesignTab mode={mode} onOpenInStudio={openInStudio} />}
        {activeTab === "context" && (
          <ContextTab
            mode={mode}
            onModeChange={setMode}
            onAnalyse={analyse}
            analysing={building}
            onGatherFindings={(kind, facts) => {
              gatherFactsRef.current[kind] = facts;
            }}
            libraryVersion={libraryVersion}
            currentEntryId={currentEntryId}
            onReopen={async (id) => {
              const entry = await getEntry(id);
              if (entry) restoreEntry(entry);
            }}
            onLibraryChange={() => setLibraryVersion((n) => n + 1)}
            onOpenGraph={() => setActiveTab("graph")}
          />
        )}
        {activeTab === "graph" && <GraphTab fitSignal={fitSignal} />}
        {activeTab === "stress" && (
          <StressTab
            onApplyLoad={applyLoad}
            onReset={handleReset}
            onReinforce={handleReinforce}
            loading={loading}
          />
        )}
      </main>

      <StatusStrip items={statusItems} />

      {/* LIVE PIPELINE overlay — bound to the REAL run. `stage` is "done"/"idle" between runs, so the
          overlay only ever shows while showPipeline is on (started by analyse/applyLoad). gatherFacts
          is a plain snapshot lifted from the finished agent runs (no @/agents import crosses here). */}
      {showPipeline && (
        <LivePipeline
          // L-1 · LivePipeline's stage prop predates the "error" member (it never needs to render
          // that state: the catch blocks above call setShowPipeline(false) in the same tick they
          // set stage to "error", so this branch is a type-safety fallback only, never a real UI
          // state — the overlay is already gone before it could paint "error").
          stage={stage === "error" ? "idle" : stage}
          stageSource={stageSource}
          running={running}
          gatherFacts={Object.values(gatherFactsRef.current)
            .flat()
            .map((f) => ({ label: f.label, value: f.value, source: f.source }))}
          onDismiss={() => setShowPipeline(false)}
        />
      )}
    </div>
  );
}
