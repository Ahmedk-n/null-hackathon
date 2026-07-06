"use client";
// V9-3 · TRUE 3D VIEW of the decision graph (react-three-fiber) — REDESIGNED to carry the
// REAL decision intelligence, not decorative boxes. A third option in the GraphTab VIEW
// control alongside PLAN / SECTION. Client-only — GraphTab loads it via next/dynamic(ssr:false)
// so the three.js bundle never touches the initial studio load or the server render.
//
// It reads the SAME standing data the 2.5D board uses on GRAPH (the base graph + keystone id +
// empty failures) and derives, from the PURE ENGINE (never re-implemented), everything the
// picture encodes:
//   • support     ← computeSupport(graph)               (0..1 per node)
//   • load impact ← rankLoadBearing(graph)              (knock-out integrity drop per assumption)
//   • keystone    ← keystone(graph) / explainKeystone   (the load-bearing apex + WHY)
//   • status band ← support vs FAILURE_THRESHOLD        (holding / stressed / failed)
//   • evidence    ← node.evidence[0]                    (top cited source, engine-inert)
//
// GEOMETRY ENCODES THE ANALYSIS (readable at a glance):
//   • SIZE  ∝ load-bearing knock-out impact → the keystone is visibly the biggest object,
//            trivial assumptions are small. This is the "which one holds everything up".
//   • COLOR = status band (--ok holding / --warn stressed / --bad failed); the KEYSTONE is
//            keystone-red so it reads as the apex.
//   • Y     = reasoning-depth stratum (depth.ts: thesis high → claims → assumptions low), so
//            the depth story survives; support is shown as a METER on the card, not the Y axis.
//   • EDGES = load path: thickness ∝ carried support; the keystone→thesis load path is
//            heaviest / red.
// Each node also carries a legible drei <Html> billboard CARD (full wrapped label, confidence
// %, support meter + STATUS, type, top evidence, keystone knock-out reason) that always faces
// the camera. Clicking a node drives the existing SelectionPanel via onSelect.
//
// Deterministic — no Math.random / Date / new Date anywhere. WebGL-unavailable → graceful notice.
import { Component, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import {
  computeSupport,
  rankLoadBearing,
  explainKeystone,
  FAILURE_THRESHOLD,
  type Graph,
  type GraphNode,
} from "@/engine";
import { layoutPositions } from "./layout";
import { LAYER_Z } from "./depth";
import {
  THESIS,
  CLAIM,
  ASSUMPTION,
  KEYSTONE,
  OK,
  WARN,
  BAD,
  BG,
  PANEL,
  HAIR,
  HAIR_STRONG,
  MUTED,
  INK,
  INK_2,
} from "@/ui/tokens";

// ── Status band ─────────────────────────────────────────────────────────────
// Support (0..1) → holding / stressed / failed, using the engine's failure threshold. The
// band above threshold is split at 0.6 into HOLDING (comfortable) and STRESSED (thin margin)
// so a judge sees which beliefs are only just carrying their load.
type Band = "holding" | "stressed" | "failed";
const STRESSED_CEIL = 0.6;
function bandOf(support: number, failed: boolean): Band {
  if (failed || support < FAILURE_THRESHOLD) return "failed";
  if (support < STRESSED_CEIL) return "stressed";
  return "holding";
}
const BAND_COLOR: Record<Band, string> = { holding: OK, stressed: WARN, failed: BAD };
const BAND_LABEL: Record<Band, string> = { holding: "HOLDING", stressed: "STRESSED", failed: "FAILED" };

// Structural role accents (thesis/claim); assumptions are coloured by status band.
const ROLE_ACCENT: Record<GraphNode["type"], string> = {
  thesis: THESIS,
  claim: CLAIM,
  assumption: ASSUMPTION,
};

// World-space framing. Nodes spread WORLD_W across x (dagre), WORLD_H across y (stratum). Each
// stratum FANS its members across z (by within-stratum index) so a crowded assumption row does
// not pile up in one place — genuine 3D volume to orbit, fully deterministic (index-derived).
const WORLD_W = 19;
const WORLD_H = 9;
const Z_STEP = 2.1;
const SUNK = 1.6; // a failed node sinks below its stratum (GRAPH carries none — parity only).

// Node radius by role/load. Assumptions scale by load-bearing impact (keystone = biggest);
// thesis/claim get fixed structural sizes kept BELOW the keystone so it always reads biggest.
const R_MIN = 0.3;
const R_MAX = 1.05;
const R_THESIS = 0.8;
const R_CLAIM = 0.58;
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

interface Placed {
  node: GraphNode;
  pos: [number, number, number];
  radius: number;
  support: number;
  confidence: number;
  impact: number; // knock-out integrity drop (0 for non-assumptions)
  band: Band;
  color: string;
  isKeystone: boolean;
  isFailed: boolean;
}

interface Derived {
  placed: Placed[];
  byId: Map<string, Placed>;
  keystonePath: Set<string>; // node ids on the keystone→thesis load path
  keystoneId: string | null;
  keystoneImpact: number;
  keystoneRatio: number; // keystoneImpact / nextImpact
  keystoneLabel: string | null;
  baseline: number;
}

/**
 * Derive the whole 3D picture from the PURE ENGINE. No re-implemented math: support from
 * computeSupport, per-assumption knock-out impact from rankLoadBearing, keystone + "why" from
 * explainKeystone. Layout x from dagre, y from the depth.ts stratum elevation, z a deterministic
 * per-stratum zig-zag. Pure data-in/data-out — no wall-clock, no randomness.
 */
function derive(graph: Graph, keystoneId: string | null, failures: ReadonlySet<string>): Derived {
  const support = computeSupport(graph);
  const ranked = rankLoadBearing(graph);
  const impactById = new Map(ranked.map((r) => [r.id, r.impact]));
  const maxImpact = ranked[0]?.impact || 1;
  const explain = explainKeystone(graph);

  // ── layout ──
  const pos = layoutPositions(graph);
  const xs = graph.nodes.map((n) => pos.get(n.id)?.x ?? 0);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;
  // Y is PURELY the reasoning-depth stratum (thesis high → assumptions low). The keystone is
  // NOT lifted out of its row (that collided its card with the claims and occluded its gem);
  // its apex reading comes from SIZE + red colour + the gem shape instead.
  const elevOf = (n: GraphNode) => LAYER_Z[n.type];
  const elevs = graph.nodes.map(elevOf);
  const minE = Math.min(...elevs);
  const spanE = Math.max(...elevs) - minE || 1;
  // Per-stratum member counts drive the centred z-fan below (so each row spreads symmetrically).
  const layerCount: Record<string, number> = {};
  for (const n of graph.nodes) layerCount[n.type] = (layerCount[n.type] ?? 0) + 1;
  const layerIndex: Record<string, number> = {};

  const placed: Placed[] = graph.nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    const i = layerIndex[n.type] ?? 0;
    layerIndex[n.type] = i + 1;
    const isKeystone = n.id === keystoneId;
    const isFailed = failures.has(n.id);
    const s = support.get(n.id) ?? 0;
    const impact = impactById.get(n.id) ?? 0;
    const band = bandOf(s, isFailed);

    // size ∝ load-bearing impact for assumptions; fixed structural size for thesis/claim.
    let radius: number;
    if (n.type === "assumption") radius = lerp(R_MIN, R_MAX, impact / maxImpact);
    else if (n.type === "thesis") radius = R_THESIS;
    else radius = R_CLAIM;

    // colour: keystone is keystone-red (the apex); assumptions by status band; thesis/claim
    // keep their structural accent (they are not the load-bearing story).
    const color = isKeystone
      ? KEYSTONE
      : n.type === "assumption"
        ? BAND_COLOR[band]
        : ROLE_ACCENT[n.type];

    const count = layerCount[n.type] ?? 1;
    const x = ((p.x - minX) / spanX - 0.5) * WORLD_W;
    let y = ((elevOf(n) - minE) / spanE - 0.5) * WORLD_H;
    if (isFailed) y -= SUNK;
    // centred fan across z by within-stratum index → crowded rows spread into depth.
    const z = (i - (count - 1) / 2) * Z_STEP;

    return {
      node: n,
      pos: [x, y, z],
      radius,
      support: s,
      confidence: n.confidence,
      impact,
      band,
      color,
      isKeystone,
      isFailed,
    };
  });

  const byId = new Map(placed.map((p) => [p.node.id, p]));

  // Keystone load path — the keystone plus all its ancestors up to the thesis. Edges whose
  // BOTH endpoints lie in this set are the load path (rendered heaviest / red).
  const parentsOf = new Map<string, string[]>();
  for (const n of graph.nodes)
    for (const g of n.groups)
      for (const c of g.childIds) parentsOf.set(c, [...(parentsOf.get(c) ?? []), n.id]);
  const keystonePath = new Set<string>();
  if (keystoneId) {
    const stack = [keystoneId];
    keystonePath.add(keystoneId);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const par of parentsOf.get(cur) ?? [])
        if (!keystonePath.has(par)) {
          keystonePath.add(par);
          stack.push(par);
        }
    }
  }

  return {
    placed,
    byId,
    keystonePath,
    keystoneId,
    keystoneImpact: explain.keystoneImpact,
    keystoneRatio: explain.impactRatio,
    keystoneLabel: explain.keystoneLabel,
    baseline: explain.baselineIntegrity,
  };
}

// ── Meter (confidence / support bar for the card) ─────────────────────────────
function Meter({ value, color, label, pct }: { value: number; color: string; label: string; pct: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          color: INK_2,
        }}
      >
        <span>{label}</span>
        <span>{pct}</span>
      </div>
      <div style={{ height: 4, background: HAIR, marginTop: 2 }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

// ── The 3D node: sized/coloured geometry + a legible billboard info card ───────
function Node({
  placed,
  path,
  selected,
  onSelect,
  keystoneImpact,
  keystoneRatio,
}: {
  placed: Placed;
  path: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
  keystoneImpact: number;
  keystoneRatio: number;
}) {
  const [hover, setHover] = useState(false);
  const { node, pos, radius, support, confidence, impact, band, color, isKeystone, isFailed } = placed;
  const bandColor = isKeystone ? KEYSTONE : BAND_COLOR[band];
  const emissive = isFailed ? 0.55 : isKeystone ? 0.6 : selected ? 0.4 : hover ? 0.28 : 0.06;
  const cardW = isKeystone ? 196 : 168;

  return (
    <group position={pos}>
      <mesh
        scale={selected ? 1.12 : hover ? 1.06 : 1}
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
        {node.type === "assumption" ? (
          isKeystone ? (
            // Keystone → a red gem (octahedron), enlarged so the apex reads as the biggest
            // object even when another assumption ties it on knock-out impact.
            <octahedronGeometry args={[radius * 1.5, 0]} />
          ) : (
            <sphereGeometry args={[radius, 24, 24]} />
          )
        ) : node.type === "thesis" ? (
          // Thesis → the capstone slab at the top of the structure.
          <boxGeometry args={[radius * 1.9, radius * 0.9, radius * 0.9]} />
        ) : (
          <boxGeometry args={[radius * 1.5, radius * 1.1, radius * 0.9]} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissive}
          roughness={0.78}
          metalness={0.08}
        />
      </mesh>

      {/* Selection halo — a wireframe cage so the SelectionPanel target is unmistakable. */}
      {selected && (
        <mesh scale={1.28}>
          <sphereGeometry args={[radius, 16, 16]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
        </mesh>
      )}

      {/* Keystone glow ring — a red torus around the gem so the load-bearing apex is findable
          at a glance even when it sits at the edge of the frame or behind a card. */}
      {isKeystone && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 2.1, 0.07, 8, 40]} />
          <meshBasicMaterial color={KEYSTONE} transparent opacity={0.8} />
        </mesh>
      )}

      {/* Billboard info card — DOM via drei <Html>, so it reuses the CAD fonts/tokens with NO
          network font (troika <Text> would fetch Roboto → breaks offline/CSP). pointerEvents
          off → it never steals an OrbitControls drag; distanceFactor shrinks distant cards so
          the scene declutters as you orbit out. The node MESH is the click target. */}
      <Html
        center
        distanceFactor={17}
        position={[0, radius + 0.7, 0]}
        pointerEvents="none"
        zIndexRange={[100, 0]}
        prepend
      >
        <div
          style={{
            width: cardW,
            transform: "translateY(-50%)",
            fontFamily: "var(--sans)",
            background: `${PANEL}f2`,
            border: `1px solid ${selected || isKeystone ? bandColor : HAIR_STRONG}`,
            borderLeft: `3px solid ${bandColor}`,
            boxShadow: isKeystone ? `0 0 0 1px ${KEYSTONE}` : "none",
            padding: "6px 8px",
            userSelect: "none",
            pointerEvents: "none",
            opacity: hover || selected ? 1 : 0.96,
          }}
        >
          {/* type + keystone badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              {node.type}
            </span>
            {isKeystone && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  fontWeight: 700,
                  color: BG,
                  background: KEYSTONE,
                  padding: "1px 5px",
                }}
              >
                ◆ KEYSTONE
              </span>
            )}
            {!isKeystone && node.type === "assumption" && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  fontWeight: 700,
                  color: bandColor,
                }}
              >
                {BAND_LABEL[band]}
              </span>
            )}
          </div>

          {/* FULL label — wraps, never clipped to 30 chars. */}
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.25,
              fontWeight: 600,
              color: isKeystone ? KEYSTONE : INK,
              wordBreak: "break-word",
            }}
          >
            {node.label}
          </div>

          {/* Confidence + support meters. */}
          <Meter value={confidence} color={INK_2} label="CONF" pct={`${Math.round(confidence * 100)}%`} />
          <Meter value={support} color={bandColor} label="SUPPORT" pct={`${Math.round(support * 100)}%`} />

          {/* Keystone knock-out reason — the WHY, straight from explainKeystone. */}
          {isKeystone && (
            <div
              style={{
                marginTop: 5,
                fontFamily: "var(--mono)",
                fontSize: 9.5,
                lineHeight: 1.35,
                color: KEYSTONE,
                borderTop: `1px solid ${HAIR}`,
                paddingTop: 4,
              }}
            >
              −{keystoneImpact.toFixed(0)} integrity if this fails
              {Number.isFinite(keystoneRatio) && keystoneRatio > 0
                ? ` · ${keystoneRatio.toFixed(1)}× the next assumption`
                : " · no other assumption is load-bearing"}
            </div>
          )}

          {/* Load-bearing readout for non-keystone assumptions (how much it holds up). */}
          {!isKeystone && node.type === "assumption" && impact > 0 && (
            <div
              style={{
                marginTop: 4,
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.04em",
                color: MUTED,
              }}
            >
              −{impact.toFixed(0)} integrity if it fails
            </div>
          )}

          {/* Top evidence source (engine-inert display annotation). */}
          {node.evidence && node.evidence[0] && (
            <div
              style={{
                marginTop: 5,
                fontSize: 9.5,
                lineHeight: 1.3,
                color: node.evidence[0].stance === "contradicts" ? BAD : MUTED,
                borderTop: `1px solid ${HAIR}`,
                paddingTop: 4,
              }}
            >
              <span style={{ fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>
                {node.evidence[0].stance === "contradicts" ? "⚠ " : "▸ "}
                {node.evidence[0].source}
              </span>
              <div style={{ color: INK_2, marginTop: 1 }}>
                {node.evidence[0].fact.length > 90
                  ? node.evidence[0].fact.slice(0, 89) + "…"
                  : node.evidence[0].fact}
              </div>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

function Edges({ derived }: { derived: Derived }) {
  const { placed, byId, keystonePath } = derived;
  const lines: { key: string; points: [number, number, number][]; color: string; width: number }[] = [];
  for (const p of placed) {
    for (const group of p.node.groups) {
      for (const childId of group.childIds) {
        const child = byId.get(childId);
        if (!child) continue;
        // Load path = both endpoints on the keystone→thesis chain: heaviest / red.
        const onPath = keystonePath.has(childId) && keystonePath.has(p.node.id);
        // Otherwise thickness ∝ the support the child carries into its parent (load flow).
        const width = onPath ? 3.4 : lerp(0.6, 2.2, child.support);
        lines.push({
          key: `${childId}->${p.node.id}`,
          points: [child.pos, p.pos],
          color: onPath ? KEYSTONE : HAIR_STRONG,
          width,
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
  const derived = useMemo(() => derive(graph, keystoneId, failures), [graph, keystoneId, failures]);
  return (
    <>
      <color attach="background" args={[BG]} />
      {/* Soft studio light — warm ambient + one directional key, gentle shading, no harsh
          speculars (matches the paper/CAD palette). */}
      <ambientLight intensity={0.9} />
      <directionalLight position={[6, 12, 8]} intensity={0.5} />
      <directionalLight position={[-8, 4, -6]} intensity={0.2} />
      <gridHelper args={[30, 30, HAIR_STRONG, HAIR]} position={[0, -WORLD_H / 2 - 1.4, 0]} />
      <Edges derived={derived} />
      {derived.placed.map((p) => (
        <Node
          key={p.node.id}
          placed={p}
          path={derived.keystonePath.has(p.node.id)}
          selected={p.node.id === selectedId}
          onSelect={onSelect}
          keystoneImpact={derived.keystoneImpact}
          keystoneRatio={derived.keystoneRatio}
        />
      ))}
      <OrbitControls enablePan enableDamping dampingFactor={0.12} makeDefault />
    </>
  );
}

// HUD legend / keystone banner — plain DOM in the wrapper (outside the Canvas) so the core
// readout (what size/colour mean + the keystone's knock-out reason) is ALWAYS visible without
// orbiting to a card. Derived once from the same pure engine call.
function Hud({ graph, keystoneId }: { graph: Graph; keystoneId: string | null }) {
  const info = useMemo(() => {
    const ex = explainKeystone(graph);
    return {
      baseline: ex.baselineIntegrity,
      label: ex.keystoneLabel,
      impact: ex.keystoneImpact,
      ratio: ex.impactRatio,
    };
  }, [graph]);
  void keystoneId;
  const chip = (c: string, t: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 9, height: 9, background: c, display: "inline-block" }} />
      {t}
    </span>
  );
  return (
    <>
      {/* top-left: title + keystone knock-out reason */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 14,
          maxWidth: 380,
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Decision Structure · 3D · Integrity {Math.round(info.baseline)}%
        </div>
        {info.label && (
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--sans)",
              fontSize: 12,
              lineHeight: 1.35,
              color: KEYSTONE,
              fontWeight: 600,
              background: `${PANEL}e6`,
              borderLeft: `3px solid ${KEYSTONE}`,
              padding: "5px 8px",
            }}
          >
            ◆ KEYSTONE — {info.label}
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: INK_2, marginTop: 2 }}>
              −{info.impact.toFixed(0)} integrity if it fails
              {Number.isFinite(info.ratio) && info.ratio > 0
                ? ` · ${info.ratio.toFixed(1)}× the next assumption`
                : ""}
            </div>
          </div>
        )}
      </div>

      {/* bottom-left: encoding legend */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 14,
          pointerEvents: "none",
          zIndex: 5,
          fontFamily: "var(--mono)",
          fontSize: 9.5,
          letterSpacing: "0.06em",
          color: INK_2,
          background: `${PANEL}d9`,
          border: `1px solid ${HAIR}`,
          padding: "6px 9px",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <span style={{ color: MUTED, letterSpacing: "0.12em" }}>SIZE = LOAD-BEARING · COLOR = STATUS</span>
        <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {chip(OK, "holding")}
          {chip(WARN, "stressed")}
          {chip(BAD, "failed")}
          {chip(KEYSTONE, "keystone")}
        </span>
      </div>
    </>
  );
}

// A small notice shown when a WebGL context can't be created (headless CI, blocked GPU) — so
// the 3D leg degrades gracefully instead of crashing the studio.
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

// Catches a WebGL/three initialisation throw and renders the notice instead of taking down the
// whole GRAPH tab.
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
    <div style={{ width: "100%", height: "100%", background: BG, position: "relative" }} data-testid="keystone-3d">
      <CanvasBoundary>
        <Canvas
          // frameloop="demand" — render only on interaction/invalidate (OrbitControls damping
          // drives its own invalidations), so the 3D view is idle-cheap and non-animated at rest.
          frameloop="demand"
          camera={{ position: [11, 6.5, 21], fov: 45 }}
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
      <Hud graph={graph} keystoneId={keystoneId} />
    </div>
  );
}
