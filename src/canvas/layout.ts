import dagre from "@dagrejs/dagre";
import type { Graph } from "@/engine";

export type LayoutMode = "simple-2d" | "layered-2-5d" | "clustered-zoom";

export function pickLayoutMode(nodeCount: number): LayoutMode {
  if (nodeCount <= 8) return "simple-2d";
  if (nodeCount <= 25) return "layered-2-5d";
  return "clustered-zoom";
}

// T3 — the dagre node box drives the layout's aspect ratio. The board is a near-square
// landscape (~1:1), but a 13-node argument fans ~7 wide × 4 ranks tall; at 200×72 with a
// wide ranksep gap the graph came out ~3:1 (wide-and-short), so a fitView had to shrink to
// the width and left the label text at ~4px. A tighter box (narrower + tall enough for a
// 2-line label) plus the tighter nodesep / taller ranksep below pulls the aspect toward the
// board's, so the same fit lands at a legible zoom that fills the frame. Kept in lockstep
// with StructuralNode's own NODE_W/NODE_H so dagre's spacing matches the rendered box.
const NODE_W = 150;
const NODE_H = 68;

/** Dagre layered layout, edges pointing child -> parent, thesis on top (rankdir BT). */
export function layoutPositions(graph: Graph): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  // T3 — nodesep tightened (less horizontal fan) and ranksep raised (taller stack) so the
  // wide-and-short 13-node graph rebalances toward the board's aspect and the fit fills it.
  g.setGraph({ rankdir: "BT", ranksep: 250, nodesep: 22 });
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
