import dagre from "@dagrejs/dagre";
import type { Graph } from "@/engine";

export type LayoutMode = "simple-2d" | "layered-2-5d" | "clustered-zoom";

export function pickLayoutMode(nodeCount: number): LayoutMode {
  if (nodeCount <= 8) return "simple-2d";
  if (nodeCount <= 25) return "layered-2-5d";
  return "clustered-zoom";
}

const NODE_W = 200;
const NODE_H = 72;

/** Dagre layered layout, edges pointing child -> parent, thesis on top (rankdir BT). */
export function layoutPositions(graph: Graph): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "BT", ranksep: 90, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) g.setNode(node.id, { width: NODE_W, height: NODE_H });
  for (const node of graph.nodes) {
    for (const group of node.groups) {
      for (const childId of group.childIds) g.setEdge(childId, node.id);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    const { x, y } = g.node(node.id);
    positions.set(node.id, { x: x - NODE_W / 2, y: y - NODE_H / 2 });
  }
  return positions;
}
