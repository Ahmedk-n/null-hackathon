"use client";
// V9-2 · TRUE 3D VIEW of the decision graph (react-three-fiber). A third option in the
// GraphTab VIEW control alongside PLAN / SECTION. Client-only — GraphTab loads it via
// next/dynamic(ssr:false) so the three.js bundle never touches the initial studio load or
// the server render. Reads the SAME standing data the 2.5D board uses on GRAPH: the base
// graph, the keystone id, and (empty on GRAPH) failures.
//
// LAYOUT MAPPING — reuse the existing derivations, no new geometry math:
//   • x  ← dagre horizontal position (layout.ts::layoutPositions), normalised & centred.
//   • y  ← stratum ELEVATION (depth.ts LAYER_Z + keystone bump): thesis highest, claims,
//          assumptions, evidence lowest — the reasoning strata stand up as real height.
//   • z  ← a deterministic per-index zig-zag within each stratum, so the structure has
//          genuine 3D volume to orbit (never Math.random / Date — fully deterministic).
import { Component, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import type { Graph, GraphNode } from "@/engine";
import { layoutPositions } from "./layout";
import { LAYER_Z, KEYSTONE_Z_BUMP } from "./depth";
import { THESIS, CLAIM, ASSUMPTION, KEYSTONE, BAD, BG, HAIR, HAIR_STRONG, MUTED, INK } from "@/ui/tokens";

// Light-ledger accents per structural role (mirrors StructuralNode). Keystone → red.
const ACCENT: Record<GraphNode["type"], string> = {
  thesis: THESIS,
  claim: CLAIM,
  assumption: ASSUMPTION,
};

// World-space framing constants. The dagre x-span maps into WORLD_W; the elevation span
// into WORLD_H; the per-stratum z zig-zag steps by Z_STEP. All deterministic.
const WORLD_W = 14;
const WORLD_H = 8;
const Z_STEP = 1.15;
// A failed node sinks below its stratum (crater); GRAPH carries no failures, so this is
// mostly for parity with the 2.5D board / STRESS-style inputs.
const SUNK = 1.4;

interface Placed {
  node: GraphNode;
  pos: [number, number, number];
  isKeystone: boolean;
  isFailed: boolean;
  accent: string;
}

/**
 * Deterministically place every node in 3D. x from dagre (normalised/centred), y from the
 * depth.ts stratum elevation, z a per-index zig-zag within the stratum for real volume.
 * Pure data-in/data-out — no wall-clock, no randomness.
 */
function place(graph: Graph, keystoneId: string | null, failures: ReadonlySet<string>): Placed[] {
  const pos = layoutPositions(graph);
  const xs = graph.nodes.map((n) => pos.get(n.id)?.x ?? 0);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;

  const elevOf = (n: GraphNode) =>
    LAYER_Z[n.type] + (n.id === keystoneId ? KEYSTONE_Z_BUMP : 0);
  const elevs = graph.nodes.map(elevOf);
  const minE = Math.min(...elevs);
  const spanE = Math.max(...elevs) - minE || 1;

  // Per-stratum running index → the deterministic z zig-zag (…,-1,0,1,-1,0,1,…).
  const layerIndex: Record<string, number> = {};

  return graph.nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    const i = layerIndex[n.type] ?? 0;
    layerIndex[n.type] = i + 1;
    const isKeystone = n.id === keystoneId;
    const isFailed = failures.has(n.id);
    const x = ((p.x - minX) / spanX - 0.5) * WORLD_W;
    let y = ((elevOf(n) - minE) / spanE - 0.5) * WORLD_H;
    if (isFailed) y -= SUNK;
    const z = ((i % 3) - 1) * Z_STEP;
    return {
      node: n,
      pos: [x, y, z] as [number, number, number],
      isKeystone,
      isFailed,
      accent: isKeystone || isFailed ? (isFailed ? BAD : KEYSTONE) : ACCENT[n.type],
    };
  });
}

function NodeBox({
  placed,
  selected,
  onSelect,
}: {
  placed: Placed;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const { node, pos, isKeystone, isFailed, accent } = placed;
  // Keystone / selected / hover read as "lit"; the emissive glow marks the load-bearing apex.
  const emissiveIntensity = isFailed ? 0.5 : isKeystone ? 0.55 : selected ? 0.4 : hover ? 0.25 : 0;
  const scale = selected ? 1.14 : hover ? 1.06 : 1;
  const label = node.label.length > 30 ? node.label.slice(0, 29) + "…" : node.label;

  return (
    <group position={pos}>
      <mesh
        scale={scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        {/* A thin CAD "card" — zero-radius box, sized to read as a plate at these scales. */}
        <boxGeometry args={[2.0, 0.72, 0.18]} />
        <meshStandardMaterial
          color={accent}
          emissive={isKeystone || isFailed ? (isFailed ? BAD : KEYSTONE) : accent}
          emissiveIntensity={emissiveIntensity}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
      {/* Selection ring — a slightly larger wireframe frame so the SelectionPanel's target
          is unmistakable in 3D without adding chrome. */}
      {selected && (
        <mesh scale={scale}>
          <boxGeometry args={[2.14, 0.86, 0.3]} />
          <meshBasicMaterial color={accent} wireframe />
        </mesh>
      )}
      {/* Billboard label — DOM via drei <Html> so it reuses the terminal/CAD fonts + tokens
          and needs NO network font (troika <Text> would fetch Roboto → breaks offline/CSP).
          pointer-events off so it never steals an OrbitControls drag. */}
      <Html center distanceFactor={11} position={[0, 0.62, 0]} pointerEvents="none" prepend>
        <div
          style={{
            fontFamily: "var(--sans)",
            fontSize: 12,
            lineHeight: 1.15,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: isFailed ? BAD : isKeystone ? KEYSTONE : INK,
            background: "rgba(245,244,239,0.82)",
            padding: "1px 5px",
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
            transform: "translateY(-50%)",
          }}
        >
          {isKeystone ? "◆ " : ""}
          {label}
        </div>
      </Html>
    </group>
  );
}

function Edges({ placed, keystoneId }: { placed: Placed[]; keystoneId: string | null }) {
  const byId = useMemo(() => {
    const m = new Map<string, Placed>();
    for (const p of placed) m.set(p.node.id, p);
    return m;
  }, [placed]);

  const lines: { key: string; points: [number, number, number][]; color: string; width: number }[] = [];
  for (const p of placed) {
    for (const group of p.node.groups) {
      for (const childId of group.childIds) {
        const child = byId.get(childId);
        if (!child) continue;
        const fromKeystone = childId === keystoneId;
        lines.push({
          key: `${childId}->${p.node.id}`,
          points: [child.pos, p.pos],
          color: fromKeystone ? KEYSTONE : HAIR_STRONG,
          width: fromKeystone ? 2.2 : 1,
        });
      }
    }
  }
  return (
    <>
      {lines.map((l) => (
        <Line key={l.key} points={l.points} color={l.color} lineWidth={l.width} />
      ))}
    </>
  );
}

function Scene({
  graph,
  keystoneId,
  failures,
  selectedId,
  onSelect,
}: {
  graph: Graph;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
  selectedId: string | null;
  onSelect?: (id: string) => void;
}) {
  const placed = useMemo(
    () => place(graph, keystoneId, failures),
    [graph, keystoneId, failures],
  );
  return (
    <>
      <color attach="background" args={[BG]} />
      {/* Soft, even studio light — a warm ambient plus one directional key so the strata
          read with gentle shading, no harsh speculars (matches the paper/CAD palette). */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 12, 8]} intensity={0.55} />
      <directionalLight position={[-8, 4, -6]} intensity={0.2} />
      {/* Faint CAD floor grid beneath the structure — hairline, calm. */}
      <gridHelper args={[26, 26, HAIR_STRONG, HAIR]} position={[0, -WORLD_H / 2 - 1, 0]} />
      <Edges placed={placed} keystoneId={keystoneId} />
      {placed.map((p) => (
        <NodeBox
          key={p.node.id}
          placed={p}
          selected={p.node.id === selectedId}
          onSelect={onSelect}
        />
      ))}
      {/* Rotate / zoom / pan — native 3D navigation. Deterministic (no auto-rotate). */}
      <OrbitControls enablePan enableDamping dampingFactor={0.12} makeDefault />
    </>
  );
}

// A small notice shown when a WebGL context can't be created (headless CI, blocked GPU) —
// so the 3D leg degrades gracefully instead of crashing the studio.
function WebGLNotice() {
  return (
    <div
      data-testid="keystone-3d-fallback"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        color: MUTED,
        fontFamily: "var(--mono)",
        fontSize: 12,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        textAlign: "center",
        padding: 24,
      }}
    >
      3D view needs WebGL — unavailable in this browser/session. Switch to PLAN or SECTION.
    </div>
  );
}

// Catches a WebGL/three initialisation throw (context lost, no GPU) and renders the notice
// instead of taking down the whole GRAPH tab.
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <WebGLNotice />;
    return this.props.children;
  }
}

// Cheap proactive probe — avoids even constructing the Canvas when WebGL is absent.
function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Keystone3D({
  graph,
  keystoneId,
  failures,
  selectedId = null,
  onSelect,
}: {
  graph: Graph;
  keystoneId: string | null;
  failures: ReadonlySet<string>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  // Probe once per mount — deterministic, no wall-clock.
  const webgl = useRef<boolean | null>(null);
  if (webgl.current === null) webgl.current = hasWebGL();
  if (!webgl.current) return <WebGLNotice />;

  return (
    <div style={{ width: "100%", height: "100%", background: BG }} data-testid="keystone-3d">
      <CanvasBoundary>
        <Canvas
          // frameloop="demand" — render only on interaction/invalidate (OrbitControls damping
          // drives its own invalidations), so the 3D view is idle-cheap and non-animated at rest.
          frameloop="demand"
          camera={{ position: [9, 4.5, 13], fov: 45 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
        >
          <Scene
            graph={graph}
            keystoneId={keystoneId}
            failures={failures}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </Canvas>
      </CanvasBoundary>
    </div>
  );
}
