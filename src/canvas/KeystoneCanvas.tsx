"use client";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Graph, Attack } from "@/engine";
// Pure, key-free classifier (data-in/data-out) — same boundary the store already crosses.
import { normaliseCategory } from "@/context/weights";
// V4-2 — constraint planes (ideas have constraints). Deep import respects the barrel guard.
import { planeStrikes, type ConstraintPlane, type PlaneStrike } from "@/context/constraints";
import type { ContextWeightAdjustment } from "@/context";
import { KEYSTONE, HAIR, HAIR_STRONG, BG, BAD, MUTED } from "@/ui/tokens";
import { layoutPositions, pickLayoutMode } from "./layout";
import {
  LAYER_Z,
  EVIDENCE_LEVEL,
  KEYSTONE_Z_BUMP,
  STRATUM_LEVEL,
  presentStrata,
  type StratumMeta,
} from "./depth";
import { StructuralNode, type StructuralNodeData, type CausalCallout } from "./StructuralNode";

const nodeTypes = { structural: StructuralNode };

// Collapse/assembly stagger index per role — the FOUNDATION (assumptions) ripples
// first (bottom-up, GOAL criterion 5); distinct from the stratum ELEVATION in ./depth.
const LAYER_INDEX = { assumption: 0, claim: 1, thesis: 2 } as const;

// Evidence plates drop LAST on collapse — a fixed delay past every node's stagger so
// the ground truth is the final thing to fall out from under the structure.
const EVIDENCE_DROP_DELAY = 0.68;

/**
 * Per-node ripple-collapse delay (W1-2). The keystone is the trigger — it fails
 * FIRST (delay 0) and hardest; the collapse then ripples outward staggered by
 * layer (bottom-up, GOAL criterion 5) and by index within each layer. Exported
 * so the stagger contract is unit-testable (keystone=0, monotonic by layer/index).
 */
export function collapseDelayFor(args: {
  isKeystone: boolean;
  layer: number;
  indexInLayer: number;
}): number {
  if (args.isKeystone) return 0;
  return args.layer * 0.18 + args.indexInLayer * 0.06;
}

/**
 * Per-node assembly build-in delay (W1-6a). Structures are RAISED bottom-up — the
 * foundation (assumptions, layer 0) settles first, the thesis (layer 2) lands last,
 * the inverse silhouette of the ripple collapse. No keystone special-case here (it
 * assembles with its layer, only the collapse singles it out). Exported so the
 * stagger contract is unit-testable (layer 0 index 0 = 0, monotonic by layer/index).
 */
export function buildDelayFor(args: { layer: number; indexInLayer: number }): number {
  return args.layer * 0.12 + args.indexInLayer * 0.05;
}

/**
 * Causal callout data (W1-5): join the context that reshaped the analysis to the
 * consequence ON the graph. When the keystone cracks we look up the attack that hit
 * it, classify its category, and match the context weight adjustment that raised that
 * category's severity — so the annotation reads from REAL pack data, never a hardcode.
 *
 * - keystone holds / no keystone → null (no callout).
 * - keystone fails but no context reweight actually moved its severity (raw mode, or
 *   no matching adjustment) → neutral { headline: "THRESHOLD CROSSED" }.
 * - keystone fails AND a matching adjustment shifted its severity → the full causal
 *   line: category + raw→reweighted severity + the adjustment's reason string.
 */
export function keystoneCalloutFor(args: {
  keystoneId: string | null;
  keystoneFailed: boolean;
  attacks: readonly Attack[];
  rawAttacks: readonly Attack[];
  adjustments: readonly ContextWeightAdjustment[];
}): CausalCallout | null {
  if (!args.keystoneFailed || !args.keystoneId) return null;
  const neutral: CausalCallout = { headline: "THRESHOLD CROSSED" };

  const eff = args.attacks.find((a) => a.targetId === args.keystoneId);
  const raw = args.rawAttacks.find((a) => a.targetId === args.keystoneId);
  if (!eff || !raw || args.adjustments.length === 0) return neutral;

  const cat = normaliseCategory(eff.category);
  if (cat === null) return neutral;
  const matches = args.adjustments.filter((w) => w.targetCategory === cat);
  if (matches.length === 0) return neutral;
  // Strongest magnitude wins — mirrors reweightAttacksByContext's own selection.
  const w = matches.reduce((a, b) => (b.magnitude > a.magnitude ? b : a));

  // If context did not actually move this severity, there is nothing causal to claim.
  if (Math.abs(eff.severity - raw.severity) < 1e-9) return neutral;

  return {
    headline: "CRACKED",
    detail: `${cat.toUpperCase()} SEVERITY ${raw.severity.toFixed(2)}→${eff.severity.toFixed(2)}`,
    reason: w.reason,
  };
}

// Graphs whose entrance build-in has already played once. Keyed on a STABLE identity
// (the base graph object) so a re-analyse replays the assembly, but tab switches /
// slider tweaks / load application (all same base graph) do not. Module-level so it
// survives the remount that a tab switch triggers.
const BUILT_IN_GRAPHS = new WeakSet<object>();

const NO_ATTACKS: readonly Attack[] = [];
const NO_ADJUSTMENTS: readonly ContextWeightAdjustment[] = [];
const NO_PLANES: readonly ConstraintPlane[] = [];

// V7-BUGFIX — the constraint rail is DOCKED in a dedicated right GUTTER so its planes,
// labels and VIOLATED tallies never cross the node area. The board reserves this fraction
// of its width on the right via fitView padding; the constraint planes live inside it.
const RIGHT_GUTTER_PCT = 15;
const BOARD_RIGHT_PCT = 100 - RIGHT_GUTTER_PCT; // left edge of the gutter, as a canvas %
// Node bounding box maps into this padded board region (matches the fitView padding below).
const BOARD_X0 = 12; // left pad % — matches fitView left padding so the leftmost node (often the keystone) never clips the edge
const BOARD_Y0 = 12; // top pad %
const BOARD_Y1 = 90; // bottom pad %

// fitView padding — when constraints are docked, reserve the right gutter so nodes never
// extend under the rail; otherwise fall back to a tight symmetric frame.
// T3 — tightened 12% → 6% now the layout aspect matches the board: the wasted margin was
// coming from the wide-and-short graph, not from padding, so the frame can hug the graph and
// hand the reclaimed pixels to zoom (legibility).
function fitPaddingFor(hasPlanes: boolean) {
  return hasPlanes
    ? ({ top: "6%", bottom: "6%", left: `${BOARD_X0}%`, right: `${RIGHT_GUTTER_PCT}%` } as const)
    : ("6%" as const);
}

// T3 — the fit is WIDTH-bound for the 13-node graph, so this cap almost never binds; it only
// governs small graphs (which may fill taller than wide). Raised 1.4 → 1.8 so a small
// height-bound graph fills instead of floating tiny. The 13-node legibility win comes from the
// rebalanced layout aspect (layout.ts) + the tighter padding above, not from this number —
// the two prior "FIX 2" passes tuned this cap without moving the width-bound fit at all.
const FIT_MAX_ZOOM = 1.8;
function fitOptionsFor(hasPlanes: boolean) {
  return { padding: fitPaddingFor(hasPlanes), maxZoom: FIT_MAX_ZOOM } as const;
}

// Re-runs fitView whenever `fitSignal` changes (drives the TopBar FIT action) OR whenever the
// board mode changes (PLAN⟷SECTION, DETAIL on/off) — a mode switch reshapes the frame (SECTION
// tilts, DETAIL docks the constraint gutter), so the default must re-fit to stay centered and
// full without a manual FIT. Lives inside <ReactFlow> so useReactFlow() resolves the context.
function FitController({
  fitSignal,
  hasPlanes,
  section,
}: {
  fitSignal?: number;
  hasPlanes: boolean;
  section: boolean;
}) {
  const { fitView } = useReactFlow();
  // Explicit FIT action (TopBar) — animated.
  useEffect(() => {
    if (fitSignal === undefined) return;
    fitView({ ...fitOptionsFor(hasPlanes), duration: 400 });
  }, [fitSignal, fitView, hasPlanes]);
  // Mode change — re-fit to the reshaped frame. Skipped on first mount (the <ReactFlow
  // fitView> prop already fits the initial view) so it only fires on an actual toggle.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    fitView({ ...fitOptionsFor(hasPlanes), duration: 400 });
  }, [section, hasPlanes, fitView]);
  return null;
}

export function KeystoneCanvas({
  graph,
  keystoneId,
  failures,
  tilt = true,
  focusLayer = null,
  loadApplied,
  attacks = NO_ATTACKS,
  rawAttacks = NO_ATTACKS,
  contextAdjustments = NO_ADJUSTMENTS,
  constraintPlanes = NO_PLANES,
  buildKey,
  onSelect,
  fitSignal,
  detail = true,
  selectedId = null,
}: {
  graph: Graph;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
  /**
   * V4-1 · DEPTH VIEW. `tilt` is now the SECTION toggle: true = the perspective strata
   * view (SECTION), false = top-down flat (PLAN, no perspective). `focusLayer` (L0..L3)
   * dims the other strata and nudges the camera toward the focused level; null = ALL.
   */
  tilt?: boolean;
  focusLayer?: number | null;
  /**
   * Whether load is currently applied — drives the keystone tension telegraph
   * (W1-7) and the force arrows (W1-6b). Falls back to "any node failed" when the
   * caller doesn't thread it.
   */
  loadApplied?: boolean;
  /** Effective (post-reweight) attacks + their raw pre-reweight counterparts, and the
   *  context weight adjustments — together they source the causal callout (W1-5). */
  attacks?: readonly Attack[];
  rawAttacks?: readonly Attack[];
  contextAdjustments?: readonly ContextWeightAdjustment[];
  /**
   * V4-2 · CONSTRAINTS AS GEOMETRY. The pack's constraints, rendered as named CAD
   * boundary planes in the right margin. When load is applied, an attack whose
   * category maps to a plane's categories STRIKES it — the plane flashes --bad,
   * draws a strike-line to the attacked node, and settles to a VIOLATED tally.
   */
  constraintPlanes?: readonly ConstraintPlane[];
  /** Stable identity for the assembly build-in (W1-6a); pass the base graph object. */
  buildKey?: object | null;
  onSelect?: (id: string) => void;
  fitSignal?: number;
  /**
   * V9-1 · MINIMALIST BOARD. When false, the board strips its chrome — the L0..L3 stratum
   * labels, the constraint rail and the force arrows are hidden, and each node renders
   * minimal (label + status dot + keystone/failed marker only). The GRAPH tab drives this
   * false by default and reveals it with a DETAIL toggle; STRESS keeps the default (true)
   * so its collapse chrome (force arrows, constraint strikes, evidence plates) is intact.
   */
  detail?: boolean;
  /** V9-1 · the selected node id — expanded inline + ringed even while the board is minimal. */
  selectedId?: string | null;
}) {
  const effectiveLoadApplied = loadApplied ?? failures.size > 0;

  // W3-5 — adaptive band drives the geometry. Band 1 (simple-2d, ≤8 nodes) renders
  // truly FLAT (PLAN): perspective off, no isometric tilt, React Flow's pointer math
  // untouched (pan/drag stay live). Band 2+ honours the DEPTH VIEW toggle — SECTION
  // (tilt=true) gives the perspective strata view the T10 contract asserts; PLAN
  // (tilt=false) is a top-down flat inspection with no perspective.
  const flat = pickLayoutMode(graph.nodes.length) === "simple-2d";
  const section = tilt && !flat;
  // Constraints docked → the board reserves a right gutter for the rail. In the minimal
  // (detail-off) board the rail is hidden, so no gutter is reserved and nodes use the full width.
  const hasPlanes = detail && constraintPlanes.length > 0;

  // W1-6a — play the assembly build-in only the first time we see this graph identity.
  const buildIdentity: object = buildKey ?? graph;
  const animateEntrance = !BUILT_IN_GRAPHS.has(buildIdentity);
  useEffect(() => {
    BUILT_IN_GRAPHS.add(buildIdentity);
  }, [buildIdentity]);

  const { nodes, edges } = useMemo(() => {
    const pos = layoutPositions(graph);
    // W1-5 — causal callout for the keystone, computed once from real pack/attack data.
    const keystoneFailed = keystoneId != null && failures.has(keystoneId);
    const callout = keystoneCalloutFor({
      keystoneId,
      keystoneFailed,
      attacks,
      rawAttacks,
      adjustments: contextAdjustments,
    });
    // Per-layer running counter → deterministic indexInLayer for the ripple.
    const layerCounts: Record<number, number> = {};
    const rfNodes: Node<StructuralNodeData>[] = graph.nodes.map((n) => {
      const isKeystone = n.id === keystoneId;
      const layer = LAYER_INDEX[n.type];
      const indexInLayer = layerCounts[layer] ?? 0;
      layerCounts[layer] = indexInLayer + 1;
      // V4-1 — stratum focus: dim every node not on the focused level. When EVIDENCE
      // (L3) is focused, all nodes dim and only the plates stay lit.
      const stratumLevel = STRATUM_LEVEL[n.type];
      const dimmed = focusLayer != null && focusLayer !== stratumLevel;
      const plateDimmed = focusLayer != null && focusLayer !== EVIDENCE_LEVEL;
      return {
        id: n.id,
        type: "structural",
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        data: {
          label: n.label,
          type: n.type,
          confidence: n.confidence,
          isKeystone,
          isFailed: failures.has(n.id),
          loadApplied: effectiveLoadApplied,
          collapseDelay: collapseDelayFor({ isKeystone, layer, indexInLayer }),
          buildDelay: buildDelayFor({ layer, indexInLayer }),
          animateEntrance,
          causalCallout: isKeystone ? callout : null,
          layer,
          translateZ: LAYER_Z[n.type] + (isKeystone ? KEYSTONE_Z_BUMP : 0),
          evidence: n.evidence,
          provenance: n.provenance,
          evidenceDropDelay: EVIDENCE_DROP_DELAY,
          dimmed,
          plateDimmed,
          detail,
          selected: n.id === selectedId,
        },
      };
    });
    const rfEdges: Edge[] = [];
    for (const parent of graph.nodes) {
      for (const group of parent.groups) {
        for (const childId of group.childIds) {
          const fromKeystone = childId === keystoneId;
          rfEdges.push({
            id: `${childId}->${parent.id}`,
            source: childId,
            target: parent.id,
            style: {
              // V9-1 · thinner, calmer support edges; the keystone load-path stays a touch
              // heavier so it still reads as the spine without shouting.
              stroke: fromKeystone ? KEYSTONE : HAIR,
              strokeWidth: fromKeystone ? 1.8 : 1,
            },
            animated: fromKeystone,
          });
        }
      }
    }
    return { nodes: rfNodes, edges: rfEdges };
  }, [
    graph,
    keystoneId,
    failures,
    effectiveLoadApplied,
    animateEntrance,
    attacks,
    rawAttacks,
    contextAdjustments,
    focusLayer,
    detail,
    selectedId,
  ]);

  // V4-1 — the strata present in this graph (drives the stratum chrome). Evidence
  // stratum appears only when a node carries evidence.
  const strata = useMemo(() => presentStrata(graph), [graph]);

  // V4-2 — collision derivation: which planes an attack category strikes. Pure/
  // deterministic (planeStrikes); only READS as violated once load is applied so the
  // planes reset to their calm --muted state when the load is cleared.
  const strikes = useMemo(
    () => planeStrikes(constraintPlanes, attacks),
    [constraintPlanes, attacks],
  );

  // Normalised (0..1) layout positions per node — the strike-line endpoints. Same
  // approximation the force arrows use (raw layout coords under the SECTION transform).
  const targetPoints = useMemo(() => {
    const pos = layoutPositions(graph);
    const xs = graph.nodes.map((n) => pos.get(n.id)?.x ?? 0);
    const ys = graph.nodes.map((n) => pos.get(n.id)?.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX || 1;
    const spanY = Math.max(...ys) - minY || 1;
    const map: Record<string, { x: number; y: number }> = {};
    for (const n of graph.nodes) {
      const p = pos.get(n.id) ?? { x: 0, y: 0 };
      map[n.id] = { x: (p.x - minX) / spanX, y: (p.y - minY) / spanY };
    }
    return map;
  }, [graph]);

  // W1-6b — force arrows. Deterministic x-positions derived from the top-layer
  // (thesis) node coordinates, spread across the load-bearing apex; only while load
  // is applied, so they vanish on reset.
  const forceArrows = useMemo(() => {
    if (!effectiveLoadApplied) return [];
    const pos = layoutPositions(graph);
    const xs = graph.nodes.map((n) => pos.get(n.id)?.x ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const span = maxX - minX || 1;
    const topNodes = graph.nodes.filter((n) => n.type === "thesis");
    const src = topNodes.length ? topNodes : graph.nodes;
    const centers = src.map((n) => ((pos.get(n.id)?.x ?? 0) - minX) / span);
    const center = centers.reduce((a, b) => a + b, 0) / centers.length;
    const clamp = (v: number) => Math.min(0.92, Math.max(0.08, v));
    return [-0.1, 0, 0.1].map((d, i) => ({ id: i, xPct: clamp(center + d) }));
  }, [graph, effectiveLoadApplied]);

  const onNodeClick: NodeMouseHandler = (_e, node) => onSelect?.(node.id);

  // W1-4 — camera shake + push-in. Fire ONCE on the empty→non-empty failure edge.
  const [shaking, setShaking] = useState(false);
  const prevFailed = useRef(0);
  useEffect(() => {
    const now = failures.size;
    if (prevFailed.current === 0 && now > 0) setShaking(true);
    prevFailed.current = now;
  }, [failures]);

  return (
    // Outer perspective container (§4). Push-in nudges the perspective on collapse;
    // it always returns to 1400px so the T10 contract stays green.
    <motion.div
      data-canvas-perspective
      initial={false}
      animate={
        !section
          ? { perspective: "none" }
          : shaking
            ? { perspective: ["1400px", "1200px", "1400px"] }
            : { perspective: "1400px" }
      }
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        width: "100%",
        height: "100%",
        perspective: section ? "1400px" : "none",
        background: BG,
      }}
    >
      {/* Shake wrapper (W1-4): jitters the whole board on failure WITHOUT touching
          the tilt transform the T10 test asserts (that lives on data-canvas-tilt). */}
      <motion.div
        initial={false}
        animate={
          shaking
            ? { x: [0, -6, 5, -3, 2, 0], rotateZ: [0, -0.6, 0.5, -0.3, 0.2, 0] }
            : { x: 0, rotateZ: 0 }
        }
        transition={{ duration: 0.4, ease: "easeInOut" }}
        onAnimationComplete={() => setShaking(false)}
        style={{ width: "100%", height: "100%" }}
      >
        <div
          data-canvas-tilt
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            // SECTION view: the isometric strata rotation, plus a subtle camera nudge
            // toward the focused stratum (L0 top → L3 bottom). PLAN view is flat (none).
            transform: section
              ? `rotateX(14deg) rotateZ(-2deg)${
                  focusLayer != null ? ` translateY(${(1.5 - focusLayer) * 26}px)` : ""
                }`
              : "none",
            transition: "transform 0.4s ease",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            // Reserve the right gutter for the constraint rail so nodes never sit under it;
            // maxZoom lets smaller graphs fit larger for comfortable default text (FIX 2).
            fitViewOptions={fitOptionsFor(hasPlanes)}
            // FIX 2 — comfortable wheel-zoom range. zoomOnScroll stays on (default) so the
            // width-bound 13-node case can be scrolled up for readability; the Controls use
            // the flow API (zoomIn/zoomOut/fitView) so they work even in SECTION mode.
            minZoom={0.3}
            maxZoom={2.5}
            // A tilted (transformed) ancestor breaks React Flow's pointer math, so pan
            // and node-drag are disabled whenever the SECTION view is active (W3-4).
            panOnDrag={!section}
            nodesDraggable={!section}
            proOptions={{ hideAttribution: true }}
          >
            {/* W3-1 — ruled CAD graph paper. V9-1 calms it: the fine grid only rules in the
                DETAIL board; at rest a single faint major grid keeps the paper quiet. */}
            {detail && (
              <Background id="grid-fine" variant={BackgroundVariant.Lines} gap={26} color={HAIR} />
            )}
            <Background
              id="grid-coarse"
              variant={BackgroundVariant.Lines}
              gap={130}
              color={detail ? HAIR_STRONG : HAIR}
            />
            <FitController fitSignal={fitSignal} hasPlanes={hasPlanes} section={section} />
            {/* FIX 2 — zoom in/out/fit buttons, restyled to the terminal/CAD aesthetic
                (zero radius, hairline border, mono, paper ground). They call the flow API,
                so zoom works even in SECTION mode where pointer-based pan is disabled. */}
            <Controls
              showInteractive={false}
              className="keystone-controls"
              fitViewOptions={fitOptionsFor(hasPlanes)}
            />
          </ReactFlow>
          {/* V9-1 — chrome is DETAIL-only. The minimal board hides the L0..L3 stratum labels,
              the constraint rail and the force arrows so the structure reads at a glance; the
              DETAIL toggle brings them back. The keystone glow + crack/failure visuals live on
              the nodes themselves, so the important signals survive minimal mode. */}
          {detail && (
            <>
              {/* V4-1 — stratum chrome: faint plane rules + L0..L3 labels, fogging with depth. */}
              <StratumChrome strata={strata} focusLayer={focusLayer} />
              {/* V4-2 — constraint boundary planes, DOCKED in the right gutter (never over nodes). */}
              <ConstraintFrame
                planes={constraintPlanes}
                strikes={strikes}
                active={effectiveLoadApplied}
                targetPoints={targetPoints}
              />
              <ForceArrows
                arrows={forceArrows}
                x0={hasPlanes ? BOARD_X0 : 12}
                x1={hasPlanes ? BOARD_RIGHT_PCT : 88}
              />
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// V4-1 — STRATUM CHROME. Faint CAD plane rules + uppercase .mono L0..L3 labels drawn
// in the canvas margin, one per stratum present, ordered top → bottom (thesis highest,
// evidence lowest). Progressive fog: each deeper stratum dims, so descending reads as
// drilling into the reasoning. The focused stratum brightens; others recede. Hairlines,
// zero radius, pointer-events off so it never intercepts canvas interaction.
function StratumChrome({
  strata,
  focusLayer,
}: {
  strata: readonly StratumMeta[];
  focusLayer: number | null;
}) {
  return (
    <div
      data-testid="stratum-chrome"
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      {strata.map((s) => {
        const topPct = 8 + s.level * 27.3;
        const focused = focusLayer === s.level;
        // Fog deepens with the stratum level; the focused stratum is pulled back to full.
        const fog = focused ? 1 : Math.max(0.28, 1 - s.level * 0.2);
        return (
          <div
            key={s.key}
            data-stratum={s.key}
            style={{ position: "absolute", left: 0, right: 0, top: `${topPct}%` }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 1,
                background: HAIR_STRONG,
                opacity: fog * 0.55,
              }}
            />
            <span
              className="mono"
              style={{
                position: "absolute",
                left: 10,
                top: -6,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: focused ? BAD : MUTED,
                opacity: fog,
                whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// V4-2 — CONSTRAINT FRAME. "Ideas have constraints" as visible geometry: each relevant
// constraint is a named CAD boundary plane — a hairline vertical rule stacked in the
// RIGHT margin (opposite the L0..L3 stratum labels, so the two never collide), zero
// radius, --muted. When load is applied and an attack's category maps to a plane's
// categories, that plane STRIKES: it flashes/settles to a persistent --bad VIOLATED
// state with a strike tally (×n), and draws a brief strike-line (animated
// strokeDashoffset, like the cracks) from the plane edge to the attacked node.
// Deterministic (strikes derive from planeStrikes, no randomness); pointer-events off
// so it never intercepts canvas interaction.
//
// T5 (finding S-1) — the rules used to carry their label rotated `writing-mode:
// vertical-rl`, jammed edge-to-edge in the gutter: unreadable, overlapping noise. The
// rules now stay as pure CAD geometry (a hairline + an upright index tick, 1..n); the
// actual label/status reads horizontally in a numbered legend band docked under the
// CONSTRAINTS header, same index order so rule #i and legend row #i are the same plane.
// Strike-lines still originate from the numbered rule. All violated/tally state below
// is the same engine-derived `planeStrikes` output as before — only the presentation
// of the label changed.
function ConstraintFrame({
  planes,
  strikes,
  active,
  targetPoints,
}: {
  planes: readonly ConstraintPlane[];
  strikes: readonly PlaneStrike[];
  active: boolean;
  targetPoints: Record<string, { x: number; y: number }>;
}) {
  if (planes.length === 0) return null;
  const strikeFor = (id: string) => strikes.find((s) => s.planeId === id);
  // Each plane's rule sits at this canvas-% from the right — all inside the reserved
  // right gutter (RIGHT_GUTTER_PCT), so no rule/label/tally can cross the node area.
  const ruleRightPct = (i: number) => 2 + i * 3;
  // T5 — legend band docks along the BOTTOM edge of the gutter (not under the
  // CONSTRAINTS header): the StressTab overlays an opaque IntegrityGauge card top-right
  // of the canvas (outside this component, out of scope here), so a top-docked legend
  // would render unreadable underneath it. The bottom of the gutter is clear.
  const LEGEND_BOTTOM_PCT = 6;
  return (
    <div
      data-testid="constraint-planes"
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      {/* Gutter datum line — the docked rail's left edge, so the constraints read as a
          separate CAD margin the structure sits inside (never over it). */}
      <div
        style={{
          position: "absolute",
          top: "4%",
          bottom: "4%",
          right: `${RIGHT_GUTTER_PCT}%`,
          width: 1,
          background: HAIR_STRONG,
          opacity: 0.4,
        }}
      />
      {/* Section header datum in the top-right — reads the frame as CAD boundary planes. */}
      <span
        className="mono"
        style={{
          position: "absolute",
          top: "1%",
          right: 8,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.16em",
          color: MUTED,
        }}
      >
        CONSTRAINTS
      </span>
      {/* Strike-lines: one animated hairline per struck plane, from its rule edge (in the
          gutter) to the attacked node (mapped into the padded board region). viewBox
          0..100 maps to canvas %, non-scaling hairline. */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {planes.map((p, i) => {
          const strike = strikeFor(p.id);
          if (!active || !strike?.struck) return null;
          const targetId = strike.targetIds[0];
          const tp = targetId ? targetPoints[targetId] : undefined;
          if (!tp) return null;
          // Rule edge lives in the gutter; the node lives in the padded board region.
          const ruleX = 100 - ruleRightPct(i);
          const ty = BOARD_Y0 + tp.y * (BOARD_Y1 - BOARD_Y0);
          const tx = BOARD_X0 + tp.x * (BOARD_RIGHT_PCT - BOARD_X0);
          return (
            <motion.line
              key={p.id}
              data-testid="constraint-strike-line"
              x1={ruleX}
              y1={ty}
              x2={tx}
              y2={ty}
              stroke={BAD}
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              strokeDasharray={1}
              initial={{ strokeDashoffset: 1, opacity: 0 }}
              animate={{ strokeDashoffset: 0, opacity: 0.85 }}
              transition={{ duration: 0.45, delay: 0.1 + i * 0.08, ease: "easeOut" }}
            />
          );
        })}
      </svg>
      {/* T5 — the rules are now pure CAD geometry: a hairline + an upright index tick
          (1..n, never rotated). The readable label/status lives in the legend band
          below; this keeps the "boundary plane" read without the rotated-text noise. */}
      {planes.map((p, i) => {
        const strike = strikeFor(p.id);
        const violated = active && !!strike?.struck;
        const color = violated ? BAD : MUTED;
        return (
          <div
            key={p.id}
            aria-hidden
            style={{ position: "absolute", top: "6%", bottom: "6%", right: `${ruleRightPct(i)}%` }}
          >
            {/* the boundary rule — 1px hairline, zero radius */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                right: 0,
                width: 1,
                background: violated ? BAD : HAIR_STRONG,
                opacity: violated ? 0.9 : 0.55,
              }}
            />
            {/* upright index tick — correlates this rule to its legend row below */}
            <span
              className="mono"
              style={{
                position: "absolute",
                top: 2,
                right: 3,
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: 0,
                color,
              }}
            >
              {i + 1}
            </span>
          </div>
        );
      })}
      {/* T5 — horizontal CONSTRAINTS legend: one readable row per plane, docked along
          the bottom of the gutter (clear of the StressTab's IntegrityGauge card, which
          overlays the top-right of this same canvas outside this component), entirely
          inside the reserved gutter so it never crosses the board. index → terse label
          → status, reusing the exact engine-derived violated state + tally (no
          writing-mode: vertical-rl, no overlap). */}
      <div
        style={{
          position: "absolute",
          bottom: `${LEGEND_BOTTOM_PCT}%`,
          right: 6,
          width: `${RIGHT_GUTTER_PCT - 1}%`,
          minWidth: 132,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {planes.map((p, i) => {
          const strike = strikeFor(p.id);
          const violated = active && !!strike?.struck;
          const color = violated ? BAD : MUTED;
          return (
            <motion.div
              key={p.id}
              data-constraint-plane={p.id}
              data-violated={violated ? "true" : undefined}
              initial={false}
              animate={violated ? { opacity: [0.3, 1, 0.85] } : { opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}
            >
              <span className="mono" style={{ fontSize: 8, fontWeight: 700, color, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  color,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {p.label}
              </span>
              {/* status — MET (muted) or the persistent VIOLATED ×n tally (bad), same
                  engine-derived tally as before, just laid out horizontally now */}
              <span
                className="mono"
                style={{
                  fontSize: 8,
                  fontWeight: violated ? 700 : 500,
                  letterSpacing: "0.04em",
                  color,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {violated ? `VIOLATED ×${strike!.tally}` : "MET"}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// W1-6b — red downward force arrows driven into the load-bearing apex when load is
// applied. Each draws its shaft (strokeDashoffset 1→0) and slides down, staggered, so
// the "load pressing in" reads while the attacks land. Positions are deterministic
// (no Math.random). pointer-events off so they never intercept canvas interaction.
function ForceArrows({
  arrows,
  x0,
  x1,
}: {
  arrows: { id: number; xPct: number }[];
  x0: number;
  x1: number;
}) {
  if (arrows.length === 0) return null;
  // Map the node-normalised x (0..1) into the padded board region so the arrows sit over
  // the load-bearing apex, not the reserved gutter.
  const toPct = (v: number) => x0 + v * (x1 - x0);
  const labelPct = toPct(arrows[Math.floor(arrows.length / 2)]?.xPct ?? 0.5);
  return (
    <div
      data-testid="force-arrows"
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      <span
        className="mono"
        style={{
          position: "absolute",
          left: `${labelPct}%`,
          top: "0.5%",
          transform: "translateX(-50%)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.14em",
          color: BAD,
          opacity: 0.7,
        }}
      >
        LOAD
      </span>
      {arrows.map((a) => (
        // Shorter shafts held ABOVE the thesis row + reduced opacity so the node text wins.
        <motion.svg
          key={a.id}
          width={26}
          height={58}
          viewBox="0 0 26 58"
          initial={{ opacity: 0, y: -22 }}
          animate={{ opacity: 0.6, y: 0 }}
          transition={{ duration: 0.5, delay: a.id * 0.12, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: `${toPct(a.xPct)}%`,
            top: "3.5%",
            marginLeft: -13,
            overflow: "visible",
          }}
        >
          <motion.line
            x1={13}
            y1={0}
            x2={13}
            y2={42}
            stroke={BAD}
            strokeWidth={2}
            pathLength={1}
            strokeDasharray={1}
            initial={{ strokeDashoffset: 1 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.5, delay: a.id * 0.12, ease: "easeOut" }}
          />
          <polyline points="5,32 13,44 21,32" fill="none" stroke={BAD} strokeWidth={2} />
        </motion.svg>
      ))}
    </div>
  );
}
