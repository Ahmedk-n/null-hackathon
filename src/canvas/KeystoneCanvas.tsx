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
import { useEffect, useMemo } from "react";
import type { Graph } from "@/engine";
import { KEYSTONE, HAIR_STRONG, BG } from "@/ui/tokens";
import { layoutPositions } from "./layout";
import { StructuralNode, type StructuralNodeData } from "./StructuralNode";

const nodeTypes = { structural: StructuralNode };

// Staggered bottom-up collapse (§4): the foundation cracks first, then claims
// tilt, then the thesis buckles — assumption 0s → claim 0.25s → thesis 0.5s.
const COLLAPSE_DELAY = { assumption: 0, claim: 0.25, thesis: 0.5 } as const;

// Layer index + resting elevation per structural role (plan §4).
const LAYER_INDEX = { assumption: 0, claim: 1, thesis: 2 } as const;
const LAYER_Z = { assumption: 0, claim: 28, thesis: 56 } as const;

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
  onSelect,
  fitSignal,
}: {
  graph: Graph;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
  tilt?: boolean;
  onSelect?: (id: string) => void;
  fitSignal?: number;
}) {
  const { nodes, edges } = useMemo(() => {
    const pos = layoutPositions(graph);
    const rfNodes: Node<StructuralNodeData>[] = graph.nodes.map((n) => {
      const isKeystone = n.id === keystoneId;
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
          collapseDelay: COLLAPSE_DELAY[n.type],
          layer: LAYER_INDEX[n.type],
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
  }, [graph, keystoneId, failures]);

  const onNodeClick: NodeMouseHandler = (_e, node) => onSelect?.(node.id);

  return (
    // Outer perspective container (§4). The inner layer carries the CAD tilt so the
    // whole board reads as an isometric assembly; TILT off flattens it to `none`.
    <div
      data-canvas-perspective
      style={{ width: "100%", height: "100%", perspective: "1400px", background: BG }}
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
    </div>
  );
}
