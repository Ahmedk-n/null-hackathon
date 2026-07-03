"use client";
import {
  ReactFlow,
  Background,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Graph } from "@/engine";
import { KEYSTONE, HAIR_STRONG, BG } from "@/ui/tokens";
import { layoutPositions } from "./layout";
import { StructuralNode, type StructuralNodeData } from "./StructuralNode";

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
  onSelect,
  fitSignal,
}: {
  graph: Graph;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
  tilt?: boolean;
  /**
   * Whether load is currently applied — drives the keystone tension telegraph
   * (W1-7). Falls back to "any node failed" when the caller doesn't thread it.
   */
  loadApplied?: boolean;
  onSelect?: (id: string) => void;
  fitSignal?: number;
}) {
  const effectiveLoadApplied = loadApplied ?? failures.size > 0;

  const { nodes, edges } = useMemo(() => {
    const pos = layoutPositions(graph);
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
  }, [graph, keystoneId, failures, effectiveLoadApplied]);

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
        shaking
          ? { perspective: ["1400px", "1200px", "1400px"] }
          : { perspective: "1400px" }
      }
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ width: "100%", height: "100%", perspective: "1400px", background: BG }}
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
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            transform: tilt ? "rotateX(14deg) rotateZ(-2deg)" : "none",
            transition: "transform 0.4s ease",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color={HAIR_STRONG} gap={26} />
            <FitController fitSignal={fitSignal} />
          </ReactFlow>
        </div>
      </motion.div>
    </motion.div>
  );
}
