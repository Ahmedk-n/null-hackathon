"use client";
// V6-1 · MiniStructure — the reusable, deterministic mini renderer extracted from the landing
// hero (MiniCollapseHero). It draws ONE decision structure in the canvas visual language:
// hairline dependency edges, mono role tags, the red keystone glow + self-drawing cracks, and an
// optional integrity readout strip. It owns NO clock and NO randomness — every frame is a pure
// function of the `tick` / `failedIds` / `cracked` props the caller passes in, so both the hero's
// 12s loop and the DESIGN tab's tournament drive the SAME renderer from their own timelines.
//
// Callers supply PLACED nodes (explicit cx/cy) so the hero keeps its hand-tuned coordinates
// byte-for-byte; `layoutStructure` auto-lays out an arbitrary Graph (layered thesis→claims→
// assumptions, bottom-up appear stagger) for callers that don't hand-place (the tournament).
import type { CSSProperties } from "react";
import type { Graph } from "@/engine";
import {
  BAD,
  CLAIM,
  HAIR,
  HAIR_STRONG,
  INK,
  KEYSTONE,
  MUTED,
  PANEL,
  THESIS,
} from "@/ui/tokens";

export type MiniRole = "thesis" | "claim" | "assumption";

export interface MiniPlaced {
  id: string;
  role: MiniRole;
  tag: string;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Tick at which this node fades in (bottom-up stagger). */
  appear: number;
}

export interface MiniReadout {
  gaugeInt: number;
  status: string;
  statusColor: string;
  phase: string;
}

const ROLE_ACCENT: Record<MiniRole, string> = { thesis: THESIS, claim: CLAIM, assumption: MUTED };

// Crack polylines drawn across the keystone box when it fails (self-drawing via a CSS
// strokeDashoffset transition). 3 lines, expressed in the keystone box's own coordinate space.
const CRACKS = ["10,0 30,20 20,30 44,44", "60,0 72,18 68,44", "38,4 50,24 46,44"];

/**
 * Auto-layout an arbitrary Graph into placed nodes + edges for the mini renderer. Layered:
 * thesis on top (L0), claims in the middle (L1), assumptions along the bottom (L2), each row
 * spread evenly across the stage. `appear` staggers bottom-up (assumptions first) so the
 * structure assembles from its foundations. Fully deterministic (node order in, coordinates out).
 */
export function layoutStructure(
  graph: Graph,
  opts: { width?: number; height?: number; keystoneId?: string } = {},
): { nodes: MiniPlaced[]; edges: [string, string][]; width: number; height: number } {
  const width = opts.width ?? 340;
  const height = opts.height ?? 210;
  const keystoneId = opts.keystoneId;

  const thesis = graph.nodes.filter((n) => n.type === "thesis");
  const claims = graph.nodes.filter((n) => n.type === "claim");
  const assumptions = graph.nodes.filter((n) => n.type === "assumption");

  const row = (
    list: typeof graph.nodes,
    cy: number,
    h: number,
    baseW: number,
    appearStart: number,
    appearStep: number,
  ): MiniPlaced[] => {
    const n = list.length;
    const spacing = width / (n + 1);
    const w = Math.min(baseW, Math.max(44, spacing * 0.92));
    return list.map((node, i) => ({
      id: node.id,
      role: node.type as MiniRole,
      tag:
        node.id === keystoneId
          ? "KEYSTONE"
          : node.type === "thesis"
            ? "THESIS"
            : node.type === "claim"
              ? "CLAIM"
              : "ASSUMPTION",
      label: node.label,
      cx: spacing * (i + 1),
      cy,
      w,
      h,
      appear: appearStart + i * appearStep,
    }));
  };

  // Bottom-up appear: assumptions first, then claims, then the thesis.
  const aStep = 2;
  const aNodes = row(assumptions, height - 32, 30, 82, 2, aStep);
  const cStart = 2 + assumptions.length * aStep + 2;
  const cNodes = row(claims, height / 2 - 4, 30, 104, cStart, 3);
  const tStart = cStart + claims.length * 3 + 3;
  const tNodes = row(thesis, 24, 34, 150, tStart, 1);

  const placed = [...aNodes, ...cNodes, ...tNodes];
  const known = new Set(placed.map((p) => p.id));
  const edges: [string, string][] = [];
  for (const node of graph.nodes) {
    for (const g of node.groups) {
      for (const childId of g.childIds) {
        if (known.has(node.id) && known.has(childId)) edges.push([node.id, childId]);
      }
    }
  }
  return { nodes: placed, edges, width, height };
}

export interface MiniStructureProps {
  nodes: MiniPlaced[];
  edges: [string, string][];
  width: number;
  height: number;
  keystoneId: string;
  /** Drives node appearance: a node is shown once `tick >= node.appear`. */
  tick: number;
  /** Nodes rendered in the failed (red, dimmed) state. */
  failedIds?: ReadonlySet<string>;
  /** When true the keystone's cracks self-draw. */
  cracked?: boolean;
  /** Stage-wide opacity (the hero fades to reset). */
  stageOpacity?: number;
  /** Optional integrity readout strip above the stage. */
  readout?: MiniReadout | null;
  /** Transition timing base (ms). Matches the caller's tick cadence. */
  tickMs?: number;
  testId?: string;
  /** Optional accent ring on the panel (the tournament survivor). */
  accented?: boolean;
  style?: CSSProperties;
}

/**
 * The renderer. Pure: identical props → identical DOM. No timers, no Date, no Math.random.
 */
export function MiniStructure({
  nodes,
  edges,
  width,
  height,
  keystoneId,
  tick,
  failedIds,
  cracked = false,
  stageOpacity = 1,
  readout = null,
  tickMs = 80,
  testId,
  accented = false,
  style,
}: MiniStructureProps) {
  const nodeById: Record<string, MiniPlaced> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const isFailed = (id: string) => (failedIds ? failedIds.has(id) : false);

  return (
    <div
      data-testid={testId}
      style={{
        border: `1px solid ${accented ? KEYSTONE : HAIR_STRONG}`,
        boxShadow: accented ? `0 0 0 1px ${KEYSTONE}` : undefined,
        background: PANEL,
        width: "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      {readout && (
        <>
          {/* Readout strip — integrity numeral, status word, phase. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "10px 16px",
              borderBottom: `1px solid ${HAIR}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="label">Integrity</span>
              <span
                className="mono"
                style={{ fontSize: 30, lineHeight: 1, color: readout.statusColor, fontWeight: 600 }}
              >
                {readout.gaugeInt}%
              </span>
            </div>
            <span className="chip" style={{ color: readout.statusColor, borderColor: readout.statusColor }}>
              {readout.status}
            </span>
            <div style={{ flex: 1 }} />
            <span className="label" style={{ letterSpacing: "0.12em", color: MUTED }}>
              {readout.phase}
            </span>
          </div>

          {/* Thin integrity bar. */}
          <div style={{ height: 3, background: HAIR, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${Math.min(100, Math.max(0, readout.gaugeInt))}%`,
                background: readout.statusColor,
                transition: `width ${tickMs}ms linear`,
              }}
            />
          </div>
        </>
      )}

      {/* Stage — fixed coordinate space, centered. */}
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 16px" }}>
        <div
          style={{
            position: "relative",
            width,
            height,
            maxWidth: "100%",
            opacity: stageOpacity,
            transition: `opacity ${tickMs}ms linear`,
          }}
        >
          {/* Hairline dependency edges (behind the nodes). */}
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden
          >
            {edges.map(([p, c]) => {
              const pn = nodeById[p];
              const cn = nodeById[c];
              if (!pn || !cn) return null;
              const shown = tick >= pn.appear;
              const failedEdge = isFailed(p) && isFailed(c);
              return (
                <line
                  key={`${p}-${c}`}
                  x1={pn.cx}
                  y1={pn.cy + pn.h / 2}
                  x2={cn.cx}
                  y2={cn.cy - cn.h / 2}
                  stroke={failedEdge ? BAD : HAIR_STRONG}
                  strokeWidth={failedEdge ? 1.4 : 1}
                  style={{
                    opacity: shown ? (failedEdge ? 0.85 : 0.55) : 0,
                    transition: "opacity 0.4s ease, stroke 0.3s ease",
                  }}
                />
              );
            })}
          </svg>

          {/* Nodes. */}
          {nodes.map((n) => {
            const shown = tick >= n.appear;
            const failed = isFailed(n.id);
            const isKey = n.id === keystoneId;
            const accent = failed ? BAD : isKey ? KEYSTONE : ROLE_ACCENT[n.role];
            const glow = isKey
              ? cracked
                ? "0 0 26px 4px rgba(178,58,46,0.85)"
                : "inset 0 0 0 1px rgba(178,58,46,0.35), 0 0 12px 0 rgba(178,58,46,0.4)"
              : "0 6px 12px rgba(26,26,21,0.10)";
            return (
              <div
                key={n.id}
                data-node={n.id}
                style={{
                  position: "absolute",
                  left: n.cx - n.w / 2,
                  top: n.cy - n.h / 2,
                  width: n.w,
                  height: n.h,
                  border: `1px solid ${accent}`,
                  borderLeft: `3px solid ${accent}`,
                  background: failed ? "#f6ecea" : PANEL,
                  boxShadow: glow,
                  padding: "5px 7px",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  opacity: shown ? (failed ? 0.55 : 1) : 0,
                  transform: shown ? "translateY(0)" : "translateY(12px)",
                  transition:
                    "opacity 0.45s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1), border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--sans)",
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: accent,
                  }}
                >
                  {failed ? "FAILED" : n.tag}
                </span>
                <div
                  style={{
                    fontFamily: "var(--sans)",
                    fontSize: n.role === "thesis" ? 12 : 10,
                    lineHeight: 1.2,
                    marginTop: 2,
                    color: INK,
                  }}
                >
                  {n.label}
                </div>

                {/* Keystone cracks — self-draw when the keystone fails. */}
                {isKey && (
                  <svg
                    width={n.w}
                    height={n.h}
                    viewBox={`0 0 ${n.w} ${n.h}`}
                    style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
                    aria-hidden
                  >
                    {CRACKS.map((pts, i) => (
                      <polyline
                        key={i}
                        points={pts}
                        fill="none"
                        stroke={i === 1 ? BAD : KEYSTONE}
                        strokeWidth={1.6 - i * 0.3}
                        strokeDasharray={200}
                        style={{
                          strokeDashoffset: cracked ? 0 : 200,
                          opacity: cracked ? 0.9 : 0,
                          transition: `stroke-dashoffset 0.35s ease ${i * 0.08}s, opacity 0.25s ease`,
                        }}
                      />
                    ))}
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
