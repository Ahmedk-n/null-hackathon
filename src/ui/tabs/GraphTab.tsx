"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  keystoneStore,
  useKeystone,
  selectProbabilistic,
  selectCalibration,
  selectCalibrationIsSample,
  selectCouncil,
} from "@/store/useKeystone";
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
import {
  LedgerRow,
  Field,
  EmptyCanvas,
  Card,
  Pill,
  Eyebrow,
  Disclosure,
} from "@/ui/primitives";
import type { PillTone } from "@/ui/primitives";
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

// The rails are now soft cards (see `Card`) on the cool canvas. These carry the
// fixed widths + the interior scroll; the Card class supplies the white ground,
// border, radius and shadow.
const RAIL: React.CSSProperties = {
  width: 340,
  minWidth: 340,
  padding: 18,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const RIGHT: React.CSSProperties = {
  width: 300,
  minWidth: 300,
  padding: 18,
  overflowY: "auto",
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
  // Clean-modern segmented control: a soft inset track, active segment lifts to a white
  // pill with a subtle shadow (matches the mockup's `.seg`).
  const seg = (active: boolean): React.CSSProperties => ({
    padding: "5px 13px",
    fontFamily: "var(--sans)",
    fontSize: 12,
    fontWeight: 550,
    textAlign: "center",
    cursor: "pointer",
    border: "none",
    borderRadius: 6,
    background: active ? "var(--panel)" : "transparent",
    color: active ? "var(--ink)" : "var(--muted)",
    boxShadow: active ? "var(--shadow-sm)" : "none",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        data-testid="depth-view-toggle"
        style={{
          display: "inline-flex",
          padding: 3,
          gap: 2,
          background: "var(--panel-2)",
          border: "1px solid var(--hair)",
          borderRadius: 8,
        }}
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
        <span className="label" style={{ fontSize: 10, color: "var(--muted)" }}>
          Drag to orbit · scroll to zoom
        </span>
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
        padding: "6px 13px",
        fontFamily: "var(--sans)",
        fontSize: 12,
        fontWeight: 550,
        textAlign: "center",
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${detail && !disabled ? "var(--accent)" : "var(--hair-strong)"}`,
        borderRadius: "var(--radius-sm)",
        background: detail && !disabled ? "var(--accent-weak)" : "var(--panel)",
        color: detail && !disabled ? "var(--accent)" : "var(--muted)",
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
  // P3-T8 · the contextual council result — feeds the SelectionPanel a node's context weight +
  // rationale on selection (only when grounded; else undefined → panel unchanged).
  const council = useKeystone(selectCouncil);
  // Task 7 · the Monte-Carlo distribution (null before a solve). Drives the gauge's P(hold)+band
  // and the driver-cluster tags/legend below. Shared singleton, so a STRESS solve lights GRAPH up.
  const probabilistic = useKeystone(selectProbabilistic);
  // P2-T5 · the caller's cross-decision track record (null until KeystoneApp's fetch effect
  // resolves). Threaded straight to the gauge for the RAW → CALIBRATED line.
  const calibration = useKeystone(selectCalibration);
  // Phase 2 whole-feature fix (honesty bug): true ONLY for the guest/offline illustrative
  // fixture — threaded to the gauge so it never words a fabricated bias as the signed-in
  // caller's own track record.
  const calibrationIsSample = useKeystone(selectCalibrationIsSample);
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

  // M-1 — reflow styles. Desktop: fixed-width rail cards + a flex graph card. Narrow: the rails
  // go full-width (fixed widths dropped) and the graph card takes an explicit height (it can't
  // be `flex:1` once stacked in a scrolling column or it collapses to 0).
  const railStyle: React.CSSProperties = narrow
    ? { ...RAIL, width: "100%", minWidth: 0, overflowY: "visible" }
    : RAIL;
  const rightStyle: React.CSSProperties = narrow
    ? { ...RIGHT, width: "100%", minWidth: 0, overflowY: "visible" }
    : RIGHT;
  const graphCardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    ...(narrow ? { height: "58vh", minHeight: 320, flex: "0 0 auto" } : { flex: 1, minWidth: 0 }),
  };

  // VERDICT status pill — the one-word read of the standing structure's integrity, on the same
  // bands the gauge uses (HOLDING ≥35 · STRESSED 10–35 · below → cracking).
  const verdict: { tone: PillTone; label: string } =
    integrityValue >= 35
      ? { tone: "hold", label: "Standing" }
      : integrityValue >= 10
        ? { tone: "warn", label: "Under strain" }
        : { tone: "crack", label: "Cracking" };
  // One-line, plain-language read of the same verdict — the answer in a sentence, above the
  // numbers, so the card leads with meaning rather than metrics.
  const verdictLine =
    verdict.tone === "hold"
      ? "This thesis holds — its claims and assumptions currently carry the load."
      : verdict.tone === "warn"
        ? "This thesis is under strain — some load-bearing support is thin."
        : "This thesis is cracking — critical support is giving way.";
  const keystoneNode = keystoneId ? displayGraph.nodes.find((n) => n.id === keystoneId) ?? null : null;

  // LEFT — the VERDICT card. Leads with the answer (pill + gauge + P(hold)/band) and its weak
  // point (the keystone callout), then folds structure counts, shared-failure drivers, filter
  // and the confidence sliders behind progressive-disclosure sections.
  const leftCardContent = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Eyebrow>Verdict</Eyebrow>
        <Pill tone={verdict.tone}>{verdict.label}</Pill>
      </div>

      {/* The answer, in a sentence — leads with meaning before the gauge throws numbers. */}
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--ink-2)", marginTop: -2 }}>
        {verdictLine}
      </div>

      <IntegrityGauge
        value={integrityValue}
        probabilistic={probabilistic}
        calibration={calibration}
        calibrationIsSample={calibrationIsSample}
        explain
      />

      {/* Keystone callout — the load-bearing assumption the whole structure hangs from. */}
      {keystoneNode && (
        <div
          style={{
            padding: 14,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--bad)",
            background: "var(--bad-bg)",
          }}
        >
          <div className="label" style={{ color: "var(--bad)" }}>
            Keystone · load-bearing assumption
          </div>
          <div style={{ fontSize: 14, fontWeight: 620, marginTop: 5, lineHeight: 1.3, color: "var(--ink)" }}>
            {keystoneNode.label}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.4 }}>
            The single most load-bearing belief — the rest of the structure hangs from it. If it
            fails, the thesis craters.
          </div>
        </div>
      )}

      {/* Task 7 · DRIVER CLUSTERS. One row per latent common-mode driver (the correlation
          clusters the probabilistic brain inferred), colour-matched to the tint on each
          assumption node's left edge. Only appears once a solve has produced a distribution. */}
      {driverLegend.length > 0 && (
        <Disclosure summary="Shared-failure drivers" testId="driver-legend">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--muted)", marginBottom: 2 }}>
              Latent factors several assumptions lean on at once. If one gives way, every
              assumption tied to it tends to fail together.
            </div>
            {driverLegend.map((d) => (
              <div
                key={d.id}
                data-testid="driver-legend-row"
                style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--ink-2)" }}
              >
                <span
                  aria-hidden
                  style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flex: "0 0 auto" }}
                />
                <span title={d.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.label}
                </span>
              </div>
            ))}
            <div className="label" style={{ fontSize: 10, color: "var(--muted)" }}>
              Assumptions tinted by shared-failure driver
            </div>
          </div>
        </Disclosure>
      )}

      {/* STRUCTURE — the counts + depth + weakest assumption, folded away for a first read. */}
      <Disclosure summary="Structure" testId="graph-structure">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, color: "var(--ink-2)" }}>
          <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--muted)" }}>
            How large and how deep the argument is, and where its thinnest belief sits.
          </div>
          <div>
            <span className="mono" style={{ color: "var(--ink)" }}>{stats.claimCount}</span> claims ·{" "}
            <span className="mono" style={{ color: "var(--ink)" }}>{stats.assumptions.length}</span> assumptions
            {depth && (
              <>
                {" "}· <span className="mono" style={{ color: "var(--ink)" }}>{depth.strata}/4</span> strata deep
              </>
            )}
          </div>
          <div>
            Weakest assumption confidence{" "}
            <span className="mono" style={{ color: "var(--ink)" }}>
              {stats.weakest ? stats.weakest.confidence.toFixed(2) : "—"}
            </span>
          </div>
          {depth && (
            <div>
              Grounded{" "}
              <span
                className="mono"
                style={{
                  color:
                    depth.assumptions > 0 && depth.grounded / depth.assumptions >= 0.6
                      ? "var(--ok)"
                      : "var(--warn)",
                }}
              >
                {depth.grounded}/{depth.assumptions}
              </span>
              <div style={{ fontSize: 11, lineHeight: 1.4, color: "var(--muted)", marginTop: 3 }}>
                Assumptions that rest on further support, not bare belief.
              </div>
            </div>
          )}
        </div>
      </Disclosure>

      {/* FILTER — power-user search / threshold, folded away. */}
      <Disclosure summary="Filter" testId="graph-filter">
        <Field label="Search" value={search} onChange={setSearch} placeholder="Label…" mono={false} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0", cursor: "pointer" }}>
          <input
            type="checkbox"
            className="ledger-check"
            checked={failedOnly}
            onChange={(e) => setFailedOnly(e.target.checked)}
          />
          <span className="label">Show failed only</span>
        </label>
        <label style={{ display: "block" }}>
          <span className="label" style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Min confidence</span>
            <span className="mono" style={{ fontSize: 11 }}>{minConf.toFixed(2)}</span>
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
      </Disclosure>

      {/* ADJUST ASSUMPTIONS — the ~9 confidence sliders, folded away; one click from every slider. */}
      <Disclosure summary="Adjust assumptions" testId="graph-assumptions">
        <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--muted)", marginBottom: 12 }}>
          Drag an assumption&rsquo;s confidence to see the verdict react (what-if).
        </div>
        {stats.assumptions.map((a) => (
          <ConfidenceSlider
            key={a.id}
            id={a.id}
            label={a.label}
            value={a.confidence}
            onChange={(id, v) => keystoneStore.getState().setConfidence(id, v)}
          />
        ))}
      </Disclosure>
    </>
  );

  const leftCard = <Card style={railStyle}>{leftCardContent}</Card>;

  // CENTER — the graph card: a header (title + the 2D/3D + DETAIL controls) over the board.
  // 2D renders the flat top-down KeystoneCanvas; 3D swaps in the lazy react-three-fiber scene
  // (native orbit/zoom/pan). Both read the SAME standing base graph + keystone.
  const graphCard = (
    <Card style={graphCardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "13px 18px",
          borderBottom: "1px solid var(--hair)",
          flexWrap: "wrap",
        }}
      >
        <Eyebrow>Argument structure</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <DepthViewToggle mode={is3D ? "3d" : "2d"} onChange={(next) => setIs3D(next === "3d")} />
          <DetailToggle detail={detail} disabled={is3D} onChange={setDetail} />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
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
            // GRAPH always renders the flat top-down board (SECTION removed). tilt=false is the
            // flat PLAN inspection; STRESS keeps the perspective view via its own constant tilt.
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
    </Card>
  );

  // RIGHT — the SELECTION card (the node inspector, wrapped in a soft card).
  const rightCard = (
    <Card style={rightStyle}>
      <SelectionPanel
        graph={displayGraph}
        selectedNodeId={selectedNodeId}
        keystoneId={keystoneId}
        nodeWeights={council?.grounded ? council.nodeWeights : undefined}
        nodeWeightsSource={council?.grounded ? council.source : undefined}
        editError={editError}
        onRename={(id, label) => keystoneStore.getState().renameNode(id, label)}
        onSetConfidence={(id, v) => keystoneStore.getState().setConfidence(id, v)}
        onAddAssumption={(parentId, label) => keystoneStore.getState().addAssumption(parentId, label)}
        onFlipGroup={(nodeId, i) => keystoneStore.getState().flipGroupKind(nodeId, i)}
        onDelete={(id) => keystoneStore.getState().deleteNode(id)}
      />
    </Card>
  );

  // The stage: three soft cards on the cool canvas with generous gutters (mockup `.stage`).
  // M-1 — narrow: graph card first, then the LEDGER/SELECTION switch, then the chosen rail
  // card, all in one column the ROOT scrolls (root is overflow-y:auto because <main> is
  // overflow:hidden in KeystoneApp). Desktop keeps the fixed rail·graph·rail row.
  const stage: React.CSSProperties = {
    display: "flex",
    gap: 16,
    padding: 16,
    background: "var(--bg)",
    boxSizing: "border-box",
  };
  return narrow ? (
    <div style={{ ...stage, flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {graphCard}
      <PaneSwitch
        options={[
          { id: "ledger", label: "Verdict" },
          { id: "selection", label: "Selection" },
        ]}
        value={mobilePane}
        onChange={setMobilePane}
      />
      {mobilePane === "ledger" ? leftCard : rightCard}
    </div>
  ) : (
    <div style={{ ...stage, height: "100%" }}>
      {leftCard}
      {graphCard}
      {rightCard}
    </div>
  );
}
