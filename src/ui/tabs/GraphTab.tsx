"use client";
import { useMemo, useState } from "react";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
  selectFailures,
} from "@/store/useKeystone";
import { pickLayoutMode } from "@/canvas/layout";
import { analysisDepth, presentStrata } from "@/canvas/depth";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { IntegrityGauge } from "@/ui/IntegrityGauge";
import { ConfidenceSlider } from "@/ui/ConfidenceSlider";
import { SelectionPanel } from "@/ui/SelectionPanel";
import { LedgerRow, SectionHeader, Field, EmptyCanvas } from "@/ui/primitives";
import type { ContextWeightAdjustment } from "@/context";

// Stable empty reference — avoids a fresh [] each render churning the memoized canvas.
const EMPTY_ADJUSTMENTS: readonly ContextWeightAdjustment[] = [];

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
  const graph = useKeystone((s) => s.workingGraph);
  const keystoneId = useKeystone(selectKeystoneId);
  const failures = useKeystone(selectFailures);
  const integrityValue = useKeystone(selectIntegrity);
  const tilt = useKeystone((s) => s.tilt);
  const selectedNodeId = useKeystone((s) => s.selectedNodeId);
  // W1-5/W1-6 — sourced from the store so the causal callout reads real pack data and
  // the force arrows / build-in key off load + base-graph identity.
  const attacks = useKeystone((s) => s.attacks);
  const rawAttacks = useKeystone((s) => s.rawAttacks);
  const loadApplied = useKeystone((s) => s.loadApplied);
  const baseGraph = useKeystone((s) => s.baseGraph);
  const pack = useKeystone((s) => s.decisionContextPack);
  const contextAdjustments = pack?.contextWeightAdjustments ?? EMPTY_ADJUSTMENTS;

  const [search, setSearch] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [minConf, setMinConf] = useState(0);
  // V4-1 — stratum focus (L0..L3), local to the GRAPH inspection surface. null = ALL.
  const [focusLayer, setFocusLayer] = useState<number | null>(null);

  // V4-1 — DEPTH metric + the strata actually present (drives the focus buttons).
  const depth = useMemo(() => (graph ? analysisDepth(graph) : null), [graph]);
  const strata = useMemo(() => (graph ? presentStrata(graph) : []), [graph]);

  const stats = useMemo(() => {
    if (!graph) return null;
    const nodes = graph.nodes;
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
  }, [graph]);

  // Minimal but functional filter: count nodes matching every active predicate.
  const matches = useMemo(() => {
    if (!graph) return [];
    const q = search.trim().toLowerCase();
    return graph.nodes.filter(
      (n) =>
        (q === "" || n.label.toLowerCase().includes(q)) &&
        (!failedOnly || failures.has(n.id)) &&
        n.confidence >= minConf,
    );
  }, [graph, search, failedOnly, minConf, failures]);

  if (!graph || !stats) {
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
          <LedgerRow label="Layout Mode" value={stats.mode} />
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

        {/* V4-1 — DEPTH VIEW: PLAN (top-down flat) ⟷ SECTION (perspective strata), plus
            stratum focus (L0..L3) that dims the other strata and nudges the camera. The
            Z-axis now ENCODES reasoning depth, not decoration. Band 1 (simple-2d) renders
            PLAN-only, so SECTION + focus are muted there. */}
        <div>
          <SectionHeader>Depth View</SectionHeader>
          {(() => {
            const flat = stats.mode === "simple-2d";
            return (
              <>
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
                <StratumFocus
                  strata={strata}
                  focusLayer={focusLayer}
                  disabled={flat || !tilt}
                  onFocus={setFocusLayer}
                />
                {depth && (
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
          graph={graph}
          keystoneId={keystoneId}
          failures={failures}
          tilt={tilt}
          focusLayer={focusLayer}
          loadApplied={loadApplied}
          attacks={attacks}
          rawAttacks={rawAttacks}
          contextAdjustments={contextAdjustments}
          buildKey={baseGraph}
          onSelect={(id) => keystoneStore.getState().setSelectedNode(id)}
          fitSignal={fitSignal}
        />
      </div>

      {/* RIGHT — SELECTION + ENCODING */}
      <div style={RIGHT}>
        <SelectionPanel graph={graph} selectedNodeId={selectedNodeId} keystoneId={keystoneId} />
      </div>
    </div>
  );
}
