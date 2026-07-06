"use client";
import { useMemo, useState } from "react";
import { keystoneStore, useKeystone } from "@/store/useKeystone";
// GRAPH shows the CLEAN STANDING structure — baseline numbers come straight from the
// pure engine on the base graph, never the store's post-stress (workingGraph) selectors.
import { integrity, keystone } from "@/engine";
import { pickLayoutMode } from "@/canvas/layout";
import { analysisDepth, presentStrata } from "@/canvas/depth";
// V4-2 — constraint planes: pure derivation from the pack (deep import; barrel guard).
import { constraintPlanes } from "@/context/constraints";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { IntegrityGauge } from "@/ui/IntegrityGauge";
import { ConfidenceSlider } from "@/ui/ConfidenceSlider";
import { SelectionPanel } from "@/ui/SelectionPanel";
import { LedgerRow, SectionHeader, Field, EmptyCanvas } from "@/ui/primitives";
import type { ContextWeightAdjustment } from "@/context";

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

// V4-1 — PLAN ⟷ SECTION segmented control (replaces the old TILT checkbox). SECTION is
// the perspective strata view; PLAN is a top-down flat inspection. Terminal/ledger
// styling: uppercase tracked .mono labels, hairline frame, zero radius.
function DepthViewToggle({
  section,
  flat,
  onChange,
}: {
  section: boolean;
  flat: boolean;
  onChange: (section: boolean) => void;
}) {
  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 8px",
    fontFamily: "var(--mono)",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textAlign: "center",
    cursor: flat ? "default" : "pointer",
    border: "none",
    borderRadius: 0,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
    opacity: flat ? 0.5 : 1,
  });
  return (
    <div>
      <div
        data-testid="depth-view-toggle"
        style={{ display: "flex", border: "1px solid var(--hair-strong)", borderRadius: 0 }}
      >
        <button
          type="button"
          aria-pressed={!section}
          disabled={flat}
          onClick={() => onChange(false)}
          style={seg(!section)}
        >
          Plan
        </button>
        <button
          type="button"
          aria-pressed={section}
          disabled={flat}
          onClick={() => onChange(true)}
          style={seg(section)}
        >
          Section
        </button>
      </div>
      {flat && (
        <div className="label" style={{ marginTop: 4, fontSize: 10, color: "var(--muted)" }}>
          Band 1 · flat plan only
        </div>
      )}
    </div>
  );
}

// V9-1 — VIEW control. Hosts the render mode (PLAN / SECTION today; a 3D option plugs in
// here in V9-2) plus a DETAIL toggle. The render-mode seam is deliberately isolated so the
// 3D leg can be added without disturbing PLAN/SECTION or the DETAIL disclosure.
function DetailToggle({ detail, onChange }: { detail: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      data-testid="detail-toggle"
      aria-pressed={detail}
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
        cursor: "pointer",
        border: "1px solid var(--hair-strong)",
        borderRadius: 0,
        background: detail ? "var(--ink)" : "transparent",
        color: detail ? "var(--bg)" : "var(--muted)",
      }}
    >
      {detail ? "Detail · On" : "Detail · Off"}
    </button>
  );
}

// V4-1 — stratum focus buttons: ALL · L0 · L1 · L2 · L3 (only the strata present).
// Selecting a level dims the other strata on the canvas and nudges the camera toward it.
function StratumFocus({
  strata,
  focusLayer,
  disabled,
  onFocus,
}: {
  strata: { level: number; key: string }[];
  focusLayer: number | null;
  disabled: boolean;
  onFocus: (level: number | null) => void;
}) {
  const chip = (active: boolean): React.CSSProperties => ({
    padding: "3px 8px",
    fontFamily: "var(--mono)",
    fontSize: 10,
    letterSpacing: "0.1em",
    cursor: disabled ? "default" : "pointer",
    border: `1px solid ${active ? "var(--ink)" : "var(--hair-strong)"}`,
    borderRadius: 0,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
    opacity: disabled ? 0.45 : 1,
  });
  return (
    <div style={{ marginTop: 6 }}>
      <span className="label" style={{ display: "block", marginBottom: 4 }}>
        Focus Stratum
      </span>
      <div data-testid="stratum-focus" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={focusLayer === null}
          onClick={() => onFocus(null)}
          style={chip(focusLayer === null)}
        >
          All
        </button>
        {strata.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={disabled}
            aria-pressed={focusLayer === s.level}
            onClick={() => onFocus(focusLayer === s.level ? null : s.level)}
            style={chip(focusLayer === s.level)}
          >
            {`L${s.level}`}
          </button>
        ))}
      </div>
    </div>
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
  const tilt = useKeystone((s) => s.tilt);
  const selectedNodeId = useKeystone((s) => s.selectedNodeId);
  const editError = useKeystone((s) => s.editError);
  const pack = useKeystone((s) => s.decisionContextPack);
  const contextAdjustments = pack?.contextWeightAdjustments ?? EMPTY_ADJUSTMENTS;
  // V4-2 — the pack's constraints as boundary planes (mirrors contextAdjustments' flow).
  const planes = useMemo(() => constraintPlanes(pack), [pack]);

  const [search, setSearch] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [minConf, setMinConf] = useState(0);
  // V4-1 — stratum focus (L0..L3), local to the GRAPH inspection surface. null = ALL.
  const [focusLayer, setFocusLayer] = useState<number | null>(null);
  // V9-1 — DETAIL disclosure. The board is MINIMAL by default (label + status dot + keystone/
  // failed marker); DETAIL reveals the chrome (stratum labels, constraint rail, force arrows)
  // and the per-node evidence/confidence. Clicking a node always fills the SelectionPanel.
  const [detail, setDetail] = useState(false);

  // V4-1 — DEPTH metric + the strata actually present (drives the focus buttons).
  const depth = useMemo(() => (displayGraph ? analysisDepth(displayGraph) : null), [displayGraph]);
  const strata = useMemo(() => (displayGraph ? presentStrata(displayGraph) : []), [displayGraph]);

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
      mode: pickLayoutMode(nodes.length),
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

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* LEFT — GRAPH LEDGER + FILTER + TILT */}
      <div style={RAIL}>
        <div>
          <SectionHeader>Graph Ledger</SectionHeader>
          <LedgerRow label="Nodes" value={stats.nodeCount} />
          <LedgerRow label="Links" value={stats.links} />
          <LedgerRow label="Assumptions" value={stats.assumptions.length} />
          <LedgerRow label="Claims" value={stats.claimCount} />
          <LedgerRow
            label="Integrity"
            value={`${Math.round(integrityValue)}%`}
            accent={
              integrityValue >= 60 ? "var(--ok)" : integrityValue >= 35 ? "var(--warn)" : "var(--bad)"
            }
          />
          <LedgerRow label="Keystone" value={keystoneId ?? "—"} accent="var(--keystone)" />
          <LedgerRow
            label="Weakest Assumption"
            value={stats.weakest ? stats.weakest.confidence.toFixed(2) : "—"}
          />
        </div>

        <IntegrityGauge value={integrityValue} />

        <div>
          <SectionHeader>Filter</SectionHeader>
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
        </div>

        {/* V9-1 — VIEW: the render mode (PLAN top-down ⟷ SECTION perspective strata; a 3D
            option plugs in here in V9-2) + the DETAIL disclosure toggle. The board stays
            MINIMAL by default; DETAIL reveals the stratum labels, constraint rail, force
            arrows and per-node evidence. Stratum focus is a DETAIL affordance (it dims the
            strata chrome), so it's disabled until DETAIL is on. Band 1 renders PLAN-only. */}
        <div>
          <SectionHeader>View</SectionHeader>
          {(() => {
            const flat = stats.mode === "simple-2d";
            return (
              <>
                {/* V9-2 SEAM — render-mode control. Today PLAN/SECTION; the 3D leg slots in
                    alongside these two without touching the DETAIL disclosure below. */}
                <DepthViewToggle
                  section={tilt && !flat}
                  flat={flat}
                  onChange={(s) => {
                    keystoneStore.getState().setTilt(s);
                    // Leaving SECTION clears focus so nodes never stay stuck-dimmed while
                    // the (now disabled) focus buttons can't reset it.
                    if (!s) setFocusLayer(null);
                  }}
                />
                <DetailToggle
                  detail={detail}
                  onChange={(v) => {
                    setDetail(v);
                    // Turning DETAIL off clears any stratum focus so nodes never stay dimmed
                    // while the (now disabled) focus buttons can't reset it.
                    if (!v) setFocusLayer(null);
                  }}
                />
                <StratumFocus
                  strata={strata}
                  focusLayer={focusLayer}
                  disabled={flat || !tilt || !detail}
                  onFocus={setFocusLayer}
                />
                {detail && depth && (
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
              </>
            );
          })()}
        </div>

        <div>
          <SectionHeader>Assumptions</SectionHeader>
          {stats.assumptions.map((a) => (
            <ConfidenceSlider
              key={a.id}
              id={a.id}
              label={a.label}
              value={a.confidence}
              onChange={(id, v) => keystoneStore.getState().setConfidence(id, v)}
            />
          ))}
        </div>
      </div>

      {/* CENTER — 3D adaptive canvas */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <KeystoneCanvas
          graph={displayGraph}
          keystoneId={keystoneId}
          // Standing structure: no failures, no glow/buckle/LOAD arrows, no constraint
          // STRIKES. Planes still render as un-violated standing datums (on-brand).
          failures={EMPTY_SET}
          tilt={tilt}
          focusLayer={focusLayer}
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
        />
      </div>

      {/* RIGHT — SELECTION + ENCODING */}
      <div style={RIGHT}>
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
    </div>
  );
}
