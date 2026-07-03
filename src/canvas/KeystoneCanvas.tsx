"use client";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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
import type { ContextWeightAdjustment } from "@/context";
import { KEYSTONE, HAIR, HAIR_STRONG, BG, BAD } from "@/ui/tokens";
import { layoutPositions, pickLayoutMode } from "./layout";
import { StructuralNode, type StructuralNodeData, type CausalCallout } from "./StructuralNode";

const nodeTypes = { structural: StructuralNode };

// Layer index + resting elevation per structural role (plan §4).
const LAYER_INDEX = { assumption: 0, claim: 1, thesis: 2 } as const;
const LAYER_Z = { assumption: 0, claim: 28, thesis: 56 } as const;

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

// Re-runs fitView whenever `fitSignal` changes (drives the TopBar FIT action).
// Lives inside <ReactFlow> so useReactFlow() resolves the flow instance context.
function FitController({ fitSignal }: { fitSignal?: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (fitSignal === undefined) return;
    fitView({ padding: 0.2, duration: 400 });
  }, [fitSignal, fitView]);
  return null;
}

export function KeystoneCanvas({
  graph,
  keystoneId,
  failures,
  tilt = true,
  loadApplied,
  attacks = NO_ATTACKS,
  rawAttacks = NO_ATTACKS,
  contextAdjustments = NO_ADJUSTMENTS,
  buildKey,
  onSelect,
  fitSignal,
}: {
  graph: Graph;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
  tilt?: boolean;
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
  /** Stable identity for the assembly build-in (W1-6a); pass the base graph object. */
  buildKey?: object | null;
  onSelect?: (id: string) => void;
  fitSignal?: number;
}) {
  const effectiveLoadApplied = loadApplied ?? failures.size > 0;

  // W3-5 — adaptive band drives the geometry. Band 1 (simple-2d, ≤8 nodes) renders
  // truly FLAT: perspective off, no isometric tilt, and React Flow's pointer math is
  // left untouched (pan/drag stay live). Band 2+ keeps the CAD perspective + tilt that
  // the T10 contract asserts on the 9-node hero graph.
  const flat = pickLayoutMode(graph.nodes.length) === "simple-2d";
  const effectiveTilt = tilt && !flat;

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
          translateZ: LAYER_Z[n.type] + (isKeystone ? 18 : 0),
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
              stroke: fromKeystone ? KEYSTONE : HAIR_STRONG,
              strokeWidth: fromKeystone ? 2.5 : 1.5,
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
  ]);

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
        flat
          ? { perspective: "none" }
          : shaking
            ? { perspective: ["1400px", "1200px", "1400px"] }
            : { perspective: "1400px" }
      }
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        width: "100%",
        height: "100%",
        perspective: flat ? "none" : "1400px",
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
            transform: effectiveTilt ? "rotateX(14deg) rotateZ(-2deg)" : "none",
            transition: "transform 0.4s ease",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            // A tilted (transformed) ancestor breaks React Flow's pointer math, so pan
            // and node-drag are disabled whenever the isometric tilt is active (W3-4).
            panOnDrag={!effectiveTilt}
            nodesDraggable={!effectiveTilt}
            proOptions={{ hideAttribution: true }}
          >
            {/* W3-1 — ruled CAD graph paper: fine minor grid + a coarser major grid. */}
            <Background id="grid-fine" variant={BackgroundVariant.Lines} gap={26} color={HAIR} />
            <Background
              id="grid-coarse"
              variant={BackgroundVariant.Lines}
              gap={130}
              color={HAIR_STRONG}
            />
            <FitController fitSignal={fitSignal} />
          </ReactFlow>
          <ForceArrows arrows={forceArrows} />
        </div>
      </motion.div>
    </motion.div>
  );
}

// W1-6b — red downward force arrows driven into the load-bearing apex when load is
// applied. Each draws its shaft (strokeDashoffset 1→0) and slides down, staggered, so
// the "load pressing in" reads while the attacks land. Positions are deterministic
// (no Math.random). pointer-events off so they never intercept canvas interaction.
function ForceArrows({ arrows }: { arrows: { id: number; xPct: number }[] }) {
  if (arrows.length === 0) return null;
  const labelPct = arrows[Math.floor(arrows.length / 2)]?.xPct ?? 0.5;
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
          left: `${labelPct * 100}%`,
          top: "1%",
          transform: "translateX(-50%)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.14em",
          color: BAD,
        }}
      >
        LOAD
      </span>
      {arrows.map((a) => (
        <motion.svg
          key={a.id}
          width={26}
          height={92}
          viewBox="0 0 26 92"
          initial={{ opacity: 0, y: -28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: a.id * 0.12, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: `${a.xPct * 100}%`,
            top: "4.5%",
            marginLeft: -13,
            overflow: "visible",
          }}
        >
          <motion.line
            x1={13}
            y1={0}
            x2={13}
            y2={72}
            stroke={BAD}
            strokeWidth={2}
            pathLength={1}
            strokeDasharray={1}
            initial={{ strokeDashoffset: 1 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.5, delay: a.id * 0.12, ease: "easeOut" }}
          />
          <polyline points="5,60 13,74 21,60" fill="none" stroke={BAD} strokeWidth={2} />
        </motion.svg>
      ))}
    </div>
  );
}
