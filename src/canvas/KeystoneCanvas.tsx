"use client";
import { ReactFlow, Background, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { Graph } from "@/engine";
import { layoutPositions } from "./layout";
import { StructuralNode, type StructuralNodeData } from "./StructuralNode";

const nodeTypes = { structural: StructuralNode };

// Staggered bottom-up collapse (§8): the foundation cracks first, then claims
// tilt, then the thesis buckles — assumption 0s → claim 0.25s → thesis 0.5s.
const COLLAPSE_DELAY = { assumption: 0, claim: 0.25, thesis: 0.5 } as const;

export function KeystoneCanvas({
  graph,
  keystoneId,
  failures,
}: {
  graph: Graph;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
}) {
  const { nodes, edges } = useMemo(() => {
    const pos = layoutPositions(graph);
    const rfNodes: Node<StructuralNodeData>[] = graph.nodes.map((n) => ({
      id: n.id,
      type: "structural",
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        type: n.type,
        confidence: n.confidence,
        isKeystone: n.id === keystoneId,
        isFailed: failures.has(n.id),
        collapseDelay: COLLAPSE_DELAY[n.type],
      },
    }));
    const rfEdges: Edge[] = [];
    for (const parent of graph.nodes) {
      for (const group of parent.groups) {
        for (const childId of group.childIds) {
          const fromKeystone = childId === keystoneId;
          rfEdges.push({
            id: `${childId}->${parent.id}`,
            source: childId,
            target: parent.id,
            style: { stroke: fromKeystone ? "#ef4444" : "#46525f", strokeWidth: fromKeystone ? 2.5 : 2 },
            animated: fromKeystone,
          });
        }
      }
    }
    return { nodes: rfNodes, edges: rfEdges };
  }, [graph, keystoneId, failures]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#161d29" />
      </ReactFlow>
    </div>
  );
}
