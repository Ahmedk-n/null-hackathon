"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { keystoneStore, useKeystone, selectProbabilistic, selectCalibration } from "@/store/useKeystone";
import { CLUSTER_PALETTE } from "@/ui/tokens";
// GRAPH shows the CLEAN STANDING structure — baseline numbers come straight from the
// pure engine on the base graph, never the store's post-stress (workingGraph) selectors.
import { integrity, keystone } from "@/engine";
import { analysisDepth } from "@/canvas/depth";
// V4-2 — constraint planes: pure derivation from the pack (deep import; barrel guard).
import { constraintPlanes } from "@/context/constraints";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { IntegrityGauge } from "@/ui/IntegrityGauge";
import { ConfidenceSlider } from "@/ui/ConfidenceSlider";
import { SelectionPanel } from "@/ui/SelectionPanel";
import { LedgerRow, SectionHeader, Field, EmptyCanvas } from "@/ui/primitives";
// T9 — reuse STRESS's disclosure verbatim so the collapsed FILTER + ASSUMPTIONS read
// (and animate) identically to the STRESS rail's collapses.
import { CollapsibleSection } from "@/ui/tabs/StressTab";
// M-1 — narrow-viewport reflow: below ~820px the fixed rail·canvas·rail row stacks into one
// scrollable column (canvas first, a LEDGER/SELECTION switch swaps the rails beneath it).
import { useIsNarrow, PaneSwitch } from "@/ui/useIsNarrow";
import type { ContextWeightAdjustment } from "@/context";

// V9-2 · TRUE 3D leg. Lazy-loaded (ssr:false) so the ~26MB three.js bundle only loads when
// the 3D view is actually chosen — it never bloats the initial studio load and never runs on
// the server (three.js needs a real WebGL/DOM context). A calm placeholder holds the frame
// while the chunk streams in.
const Keystone3D = dynamic(() => import("@/canvas/Keystone3D"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted)",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}
    >
      Loading 3D…
    </div>
  ),
});

// Stable empty reference — avoids a fresh [] each render churning the memoized canvas.
const EMPTY_ADJUSTMENTS: readonly ContextWeightAdjustment[] = [];
// GRAPH is always the standing structure: no failures, no applied load, no attacks. Stable
// module-level references keep the memoized canvas from churning on every render.
const EMPTY_SET: ReadonlySet<string> = new Set();
const NO_ATTACKS: readonly [] = [];

const RAIL: React.CSSProperties = {
  width: 340,
  minWidth: 340,
  borderRight: "1px solid var(--hair)",
  padding: "var(--pad)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "var(--gap)",
  background: "var(--panel)",
};

const RIGHT: React.CSSProperties = {
  width: 300,
  minWidth: 300,
  borderLeft: "1px solid var(--hair)",
  padding: "var(--pad)",
  overflowY: "auto",
  background: "var(--panel)",
};

// V4-1 · segmented VIEW control. T9 removes SECTION — the 2.5D perspective tilt barely
// differed from flat PLAN at the angle it rendered and slightly hurt legibility, so the user
// cut it. Two segments remain: **2D** (the flat top-down inspection board — what PLAN always
// was) and **3D** (the true react-three-fiber orbit scene). Terminal/ledger styling: uppercase
// tracked .mono labels, hairline frame, zero radius. Both are always available.
type ViewMode = "2d" | "3d";
function DepthViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 8px",
    fontFamily: "var(--mono)",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textAlign: "center",
    cursor: "pointer",
    border: "none",
    borderRadius: 0,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
  });
  return (
    <div>
      <div
        data-testid="depth-view-toggle"
        style={{ display: "flex", border: "1px solid var(--hair-strong)", borderRadius: 0 }}
      >
        <button
          type="button"
          aria-pressed={mode === "2d"}
          onClick={() => onChange("2d")}
          style={seg(mode === "2d")}
        >
          2D
        </button>
        <button
          type="button"
          data-testid="view-3d"
          aria-pressed={mode === "3d"}
          onClick={() => onChange("3d")}
          style={seg(mode === "3d")}
        >
          3D
        </button>
      </div>
      {mode === "3d" && (
        <div className="label" style={{ marginTop: 4, fontSize: 10, color: "var(--muted)" }}>
          Drag to orbit · scroll to zoom
        </div>
      )}
    </div>
  );
}

// V9-1 — DETAIL disclosure toggle. The flat 2D board is MINIMAL by default (label + status
// dot + keystone/failed marker); DETAIL reveals the chrome (stratum labels, constraint rail,
// force arrows) and per-node evidence/confidence. Inert (disabled) in 3D.
function DetailToggle({
  detail,
  disabled = false,
  onChange,
}: {
  detail: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-testid="detail-toggle"
      aria-pressed={detail}
      disabled={disabled}
      onClick={() => onChange(!detail)}
      style={{
        marginTop: 8,
        width: "100%",
        padding: "7px 8px",
        fontFamily: "var(--mono)",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        textAlign: "center",
        cursor: disabled ? "default" : "pointer",
        border: "1px solid var(--hair-strong)",
        borderRadius: 0,
        background: detail && !disabled ? "var(--ink)" : "transparent",
        color: detail && !disabled ? "var(--bg)" : "var(--muted)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {detail ? "Detail · On" : "Detail · Off"}
    </button>
  );
}

export function GraphTab({ fitSignal }: { fitSignal?: number }) {
  const workingGraph = useKeystone((s) => s.workingGraph);
  const baseGraph = useKeystone((s) => s.baseGraph);
  // GRAPH always renders the CLEAN STANDING structure. The store's workingGraph holds the
  // attacked/collapsed state after a STRESS run (Apply Load); driving the GRAPH view from
  // the base graph keeps it standing at baseline. The collapse view lives on STRESS only.
  const displayGraph = baseGraph ?? workingGraph;
  // Baseline numbers straight from the pure engine on the standing graph — never the
  // post-stress store selectors (selectIntegrity/selectKeystoneId/selectFailures).
  const keystoneId = useMemo(
    () => (displayGraph ? keystone(displayGraph)?.id ?? null : null),
    [displayGraph],
  );
  const integrityValue = useMemo(
    () => (displayGraph ? integrity(displayGraph) : 0),
    [displayGraph],
  );
  // Standing structure carries no failures — the GRAPH is un-collapsed by construction.
  const failures = EMPTY_SET;
  const selectedNodeId = useKeystone((s) => s.selectedNodeId);
  const editError = useKeystone((s) => s.editError);
  // Task 7 · the Monte-Carlo distribution (null before a solve). Drives the gauge's P(hold)+band
  // and the driver-cluster tags/legend below. Shared singleton, so a STRESS solve lights GRAPH up.
  const probabilistic = useKeystone(selectProbabilistic);
  // P2-T5 · the caller's cross-decision track record (null until KeystoneApp's fetch effect
  // resolves). Threaded straight to the gauge for the RAW → CALIBRATED line.
  const calibration = useKeystone(selectCalibration);
  const pack = useKeystone((s) => s.decisionContextPack);
  const contextAdjustments = pack?.contextWeightAdjustments ?? EMPTY_ADJUSTMENTS;
  // V4-2 — the pack's constraints as boundary planes (mirrors contextAdjustments' flow).
  const planes = useMemo(() => constraintPlanes(pack), [pack]);

  const [search, setSearch] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [minConf, setMinConf] = useState(0);
  // DETAIL disclosure. Task 7 flips the default ON: the founder wanted the graph to open with
  // its chrome (stratum labels, constraint rail, per-node evidence/confidence) rather than the
  // bare minimal board, so the structure reads in full on arrival. The toggle still collapses it
  // back to the minimal board (label + status dot + keystone/failed marker) on demand.
  const [detail, setDetail] = useState(true);
  // V9-2 — TRUE 3D leg. When true the center board swaps the flat 2D KeystoneCanvas for the
  // lazy-loaded <Keystone3D> react-three-fiber scene (native orbit/zoom/pan). The 2D-only
  // DETAIL chrome is inert in 3D, so it disables while it's active. Local to the GRAPH
  // surface; STRESS is untouched.
  const [is3D, setIs3D] = useState(false);
  // M-1 — below ~820px the three-pane row reflows to a single scrollable column: canvas first
  // (explicit height, since it can't be `flex:1` when stacked), then a LEDGER/SELECTION switch
  // that swaps which rail shows beneath it. Desktop (narrow === false, always so on the server
  // and in jsdom) is untouched. `mobilePane` is inert on desktop where both rails render.
  const narrow = useIsNarrow(820);
  const [mobilePane, setMobilePane] = useState<"ledger" | "selection">("ledger");

  // V4-1 — DEPTH metric for the compact Depth/Grounded readout under VIEW.
  const depth = useMemo(() => (displayGraph ? analysisDepth(displayGraph) : null), [displayGraph]);

  // Task 7 · DRIVER CLUSTERS. Each probabilistic cluster is a latent common-mode driver; an
  // assumption's dominant driver is the cluster whose assumptionIds contain it. Build (a) the
  // legend rows (driver label + a stable palette colour, indexed by cluster order) and (b) the
  // assumptionId → { label, colour } tag map threaded to the canvas so the board tints each
  // assumption's left edge by its driver. Null before a solve → no tags, no legend (board as-is).
  const { driverTags, driverLegend } = useMemo(() => {
    const tags = new Map<string, { label: string; color: string }>();
    const legend: { id: string; label: string; color: string }[] = [];
    if (!probabilistic) return { driverTags: undefined, driverLegend: legend };
    probabilistic.clusters.forEach((c, i) => {
      const color = CLUSTER_PALETTE[i % CLUSTER_PALETTE.length];
      legend.push({ id: c.driverId, label: c.label, color });
      for (const aid of c.assumptionIds) {
        // First (highest-variance) cluster claiming an assumption wins its dominant tag.
        if (!tags.has(aid)) tags.set(aid, { label: c.label, color });
      }
    });
    return { driverTags: tags, driverLegend: legend };
  }, [probabilistic]);

  const stats = useMemo(() => {
    if (!displayGraph) return null;
    const nodes = displayGraph.nodes;
    const links = nodes.reduce(
      (acc, n) => acc + n.groups.reduce((a, g) => a + g.childIds.length, 0),
      0,
    );
    const assumptions = nodes.filter((n) => n.type === "assumption");
    const claims = nodes.filter((n) => n.type === "claim");
    const weakest = [...assumptions].sort((a, b) => a.confidence - b.confidence)[0] ?? null;
    return {
      nodeCount: nodes.length,
      links,
      assumptions,
      claimCount: claims.length,
      weakest,
    };
  }, [displayGraph]);

  // Minimal but functional filter: count nodes matching every active predicate.
  const matches = useMemo(() => {
    if (!displayGraph) return [];
    const q = search.trim().toLowerCase();
    return displayGraph.nodes.filter(
      (n) =>
        (q === "" || n.label.toLowerCase().includes(q)) &&
        (!failedOnly || failures.has(n.id)) &&
        n.confidence >= minConf,
    );
  }, [displayGraph, search, failedOnly, minConf, failures]);

  if (!displayGraph || !stats) {
    return <EmptyCanvas />;
  }

  // M-1 — reflow styles. Desktop: fixed rails + flex canvas. Narrow: full-width rails (the
  // 340/300 widths, min-widths and side borders dropped so nothing exceeds the viewport) and a
  // canvas with an explicit height (it can't be `flex:1` once stacked or it collapses to 0).
  const railStyle: React.CSSProperties = narrow
    ? { ...RAIL, width: "100%", minWidth: 0, borderRight: "none", overflowY: "visible" }
    : RAIL;
  const rightStyle: React.CSSProperties = narrow
    ? { ...RIGHT, width: "100%", minWidth: 0, borderLeft: "none", overflowY: "visible" }
    : RIGHT;
  const canvasStyle: React.CSSProperties = narrow
    ? { height: "58vh", minHeight: 320, flex: "0 0 auto" }
    : { flex: 1, minWidth: 0 };

  // LEFT — VERDICT (gauge + keystone + weakest) · collapsed FILTER · VIEW · collapsed ASSUMPTIONS.
  // T9 declutter: the rail now LEADS with the answer and its weak point, folds the power-user
  // FILTER and the ~9 confidence sliders behind disclosures, and drops the Nodes/Links/Assumptions/
  // Claims count stack — the bottom StatusStrip already carries Nodes/Links/Integrity/Keystone, so
  // the rail was repeating them. The remaining counts fold into one caption.
  const leftRail = (
      <div style={railStyle}>
        {/* VERDICT — the answer (55% HOLDING gauge) and its weak point (keystone + weakest
            assumption), the first thing you see. */}
        <div>
          <SectionHeader>Verdict</SectionHeader>
          <IntegrityGauge value={integrityValue} probabilistic={probabilistic} calibration={calibration} />
          <LedgerRow label="Keystone" value={keystoneId ?? "—"} accent="var(--keystone)" />
          <LedgerRow
            label="Weakest Assumption"
            value={stats.weakest ? stats.weakest.confidence.toFixed(2) : "—"}
          />
          {/* De-dupe: the old Nodes/Links/Assumptions/Claims rows collapsed to one caption
              (StatusStrip carries the canonical Nodes/Links). */}
          <div className="label" style={{ marginTop: 6, color: "var(--muted)" }}>
            {`${stats.assumptions.length} assumptions · ${stats.claimCount} claims`}
          </div>
        </div>

        {/* Task 7 · DRIVER CLUSTERS legend. One row per latent common-mode driver (the
            correlation clusters the probabilistic brain inferred), colour-matched to the tint
            on each assumption node's left edge. Only appears once a solve has produced a
            distribution; it is the cluster SEED for the later semantic-zoom pass (grouping +
            legend only — no new navigation). */}
        {driverLegend.length > 0 && (
          <div data-testid="driver-legend">
            <SectionHeader>Driver Clusters</SectionHeader>
            {driverLegend.map((d) => (
              <div
                key={d.id}
                data-testid="driver-legend-row"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    background: d.color,
                    border: "1px solid var(--ink)",
                    flex: "0 0 auto",
                  }}
                />
                <span
                  className="label"
                  title={d.label}
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {d.label}
                </span>
              </div>
            ))}
            <div
              className="label"
              style={{ marginTop: 4, fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}
            >
              Assumptions Tinted By Shared-Failure Driver
            </div>
          </div>
        )}

        {/* FILTER — power-user search/threshold, not needed for a first read of a 13-node
            graph, so it folds behind a collapsed-by-default disclosure. */}
        <CollapsibleSection label="Filter" testId="graph-filter">
          <Field label="Search" value={search} onChange={setSearch} placeholder="Label…" mono={false} />
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              className="ledger-check"
              checked={failedOnly}
              onChange={(e) => setFailedOnly(e.target.checked)}
            />
            <span className="label">Show Failed Only</span>
          </label>
          <label style={{ display: "block" }}>
            <span
              className="label"
              style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
            >
              <span>Min Confidence</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {minConf.toFixed(2)}
              </span>
            </span>
            <input
              type="range"
              className="ledger-range"
              min={0}
              max={1}
              step={0.01}
              value={minConf}
              onChange={(e) => setMinConf(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>
          <LedgerRow label="Matches" value={`${matches.length} / ${stats.nodeCount}`} />
        </CollapsibleSection>

        {/* VIEW — the 2D ⟷ 3D render toggle (T9 dropped SECTION) + the DETAIL disclosure.
            2D is the flat top-down board; 3D swaps in the lazy react-three-fiber scene. The
            board stays MINIMAL by default; DETAIL reveals stratum labels, the constraint rail,
            force arrows and per-node evidence. DETAIL is 2D-only, so it disables in 3D. */}
        <div>
          <SectionHeader>View</SectionHeader>
          <DepthViewToggle
            mode={is3D ? "3d" : "2d"}
            onChange={(next) => setIs3D(next === "3d")}
          />
          <DetailToggle detail={detail} disabled={is3D} onChange={setDetail} />
          {!is3D && detail && depth && (
            <>
              <LedgerRow label="Depth" value={`${depth.strata}/4 strata`} />
              <LedgerRow
                label="Grounded"
                value={`${depth.grounded}/${depth.assumptions}`}
                accent={
                  depth.assumptions > 0 && depth.grounded / depth.assumptions >= 0.6
                    ? "var(--ok)"
                    : "var(--warn)"
                }
              />
            </>
          )}
        </div>

        {/* ASSUMPTIONS — the ~9 confidence sliders were the single biggest source of rail
            length. Folded behind a collapsed-by-default disclosure; every slider stays one
            click away. */}
        <CollapsibleSection label="Adjust Assumptions" testId="graph-assumptions">
          {stats.assumptions.map((a) => (
            <ConfidenceSlider
              key={a.id}
              id={a.id}
              label={a.label}
              value={a.confidence}
              onChange={(id, v) => keystoneStore.getState().setConfidence(id, v)}
            />
          ))}
        </CollapsibleSection>
      </div>
  );

  // CENTER — adaptive board. 2D renders the flat top-down KeystoneCanvas; 3D swaps in the
  // lazy react-three-fiber scene (native orbit/zoom/pan — its own controls replace the 2D
  // zoom buttons). Both read the SAME standing base graph + keystone; failures stay empty
  // on GRAPH. Selecting a node in 3D drives the SAME SelectionPanel via setSelectedNode.
  const canvasPane = (
      <div style={canvasStyle}>
        {is3D ? (
          <Keystone3D
            graph={displayGraph}
            keystoneId={keystoneId}
            failures={EMPTY_SET}
            selectedId={selectedNodeId}
            onSelect={(id) => keystoneStore.getState().setSelectedNode(id)}
          />
        ) : (
          <KeystoneCanvas
            graph={displayGraph}
            keystoneId={keystoneId}
            // Standing structure: no failures, no glow/buckle/LOAD arrows, no constraint
            // STRIKES. Planes still render as un-violated standing datums (on-brand).
            failures={EMPTY_SET}
            // T9 — GRAPH always renders the flat top-down board (SECTION removed). tilt=false
            // is the flat PLAN inspection; no stratum focus dimming (that was a SECTION-only
            // affordance). STRESS keeps the perspective view via its own constant tilt=true.
            tilt={false}
            focusLayer={null}
            loadApplied={false}
            attacks={NO_ATTACKS}
            rawAttacks={NO_ATTACKS}
            contextAdjustments={contextAdjustments}
            constraintPlanes={planes}
            buildKey={baseGraph}
            onSelect={(id) => keystoneStore.getState().setSelectedNode(id)}
            fitSignal={fitSignal}
            detail={detail}
            selectedId={selectedNodeId}
            driverTags={driverTags}
          />
        )}
      </div>
  );

  // RIGHT — SELECTION + ENCODING
  const rightRail = (
      <div style={rightStyle}>
        <SelectionPanel
          graph={displayGraph}
          selectedNodeId={selectedNodeId}
          keystoneId={keystoneId}
          editError={editError}
          onRename={(id, label) => keystoneStore.getState().renameNode(id, label)}
          onSetConfidence={(id, v) => keystoneStore.getState().setConfidence(id, v)}
          onAddAssumption={(parentId, label) => keystoneStore.getState().addAssumption(parentId, label)}
          onFlipGroup={(nodeId, i) => keystoneStore.getState().flipGroupKind(nodeId, i)}
          onDelete={(id) => keystoneStore.getState().deleteNode(id)}
        />
      </div>
  );

  // M-1 — narrow: canvas first, then the LEDGER/SELECTION switch, then the chosen rail, all in
  // one column the ROOT scrolls (root is overflow-y:auto here because <main> is overflow:hidden
  // in KeystoneApp; without this the stacked column can't reach its bottom panel). Desktop keeps
  // the original fixed rail·canvas·rail flex row, unchanged.
  return narrow ? (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {canvasPane}
      <div style={{ padding: "var(--pad) var(--pad) 0" }}>
        <PaneSwitch
          options={[
            { id: "ledger", label: "Ledger" },
            { id: "selection", label: "Selection" },
          ]}
          value={mobilePane}
          onChange={setMobilePane}
        />
      </div>
      {mobilePane === "ledger" ? leftRail : rightRail}
    </div>
  ) : (
    <div style={{ display: "flex", height: "100%" }}>
      {leftRail}
      {canvasPane}
      {rightRail}
    </div>
  );
}
