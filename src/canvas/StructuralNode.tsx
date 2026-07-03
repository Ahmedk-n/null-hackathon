"use client";
import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import type { NodeType } from "@/engine";

export interface StructuralNodeData {
  label: string;
  type: NodeType;
  confidence: number;
  isKeystone: boolean;
  isFailed: boolean;
  collapseDelay?: number;
  [key: string]: unknown;
}

const BORDER: Record<NodeType, string> = { thesis: "#3b82f6", claim: "#14b8a6", assumption: "#4b5563" };

// Band-2 (§8) pseudo-depth: assumptions are the foundation (z=0, recessed),
// claims sit mid (z=1), the thesis is raised (z=2, brightest/largest).
const DEPTH: Record<NodeType, number> = { assumption: 0, claim: 1, thesis: 2 };

// Per-layer depth cues expressed purely in CSS.
const SCALE_BY_Z = [1.0, 1.03, 1.06];
const BRIGHTNESS_BY_Z = [0.92, 1.0, 1.08];
// Foundation gets a longer, softer shadow; raised layers a tighter, stronger one.
const SHADOW_BY_Z = [
  "0 10px 22px rgba(0,0,0,0.55)",
  "0 8px 18px rgba(0,0,0,0.5)",
  "0 6px 16px rgba(59,130,246,0.35), 0 4px 10px rgba(0,0,0,0.5)",
];
const BASE_OPACITY_BY_Z = [0.9, 0.97, 1.0];

export function StructuralNode({ data }: { data: StructuralNodeData }) {
  const z = DEPTH[data.type];
  const border = data.isKeystone ? "#ef4444" : BORDER[data.type];
  const fill = data.isKeystone
    ? "#2a1416"
    : data.type === "thesis"
      ? "#12233b"
      : data.type === "claim"
        ? "#0f2528"
        : "#1a2130";

  const showCracks = data.isFailed || data.isKeystone;
  // A failed keystone shatters hardest.
  const crackStrength = data.isFailed && data.isKeystone ? 1 : data.isKeystone ? 0.55 : 0.75;

  // Keystone glow always sits above the layer elevation shadow.
  const restingShadow = data.isKeystone
    ? "0 0 16px rgba(239,68,68,0.65), " + SHADOW_BY_Z[z]
    : SHADOW_BY_Z[z];
  const failedShadow = "0 0 20px rgba(239,68,68,0.55), 0 14px 26px rgba(0,0,0,0.6)";

  const collapseDelay = data.collapseDelay ?? 0;

  return (
    <motion.div
      initial={false}
      animate={
        data.isFailed
          ? { opacity: 0.42, rotate: data.type === "thesis" ? -2 : data.type === "claim" ? -8 : -4, y: 14, scale: SCALE_BY_Z[z] * 0.98 }
          : { opacity: BASE_OPACITY_BY_Z[z], rotate: 0, y: 0, scale: SCALE_BY_Z[z] }
      }
      transition={{ duration: 0.55, delay: data.isFailed ? collapseDelay : 0, ease: "easeInOut" }}
      style={{
        position: "relative",
        width: 200,
        height: 72,
        borderRadius: 10,
        border: `2px solid ${border}`,
        background: fill,
        boxShadow: data.isFailed ? failedShadow : restingShadow,
        filter: `brightness(${data.isFailed ? 0.85 : BRIGHTNESS_BY_Z[z]})`,
        padding: 8,
        boxSizing: "border-box",
        color: "#e6edf3",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: data.isKeystone ? "#f87171" : "#8b98a5" }}>
        {(data.isKeystone ? "KEYSTONE" : data.type.toUpperCase())} · {data.confidence.toFixed(2)}
      </div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{data.label}</div>

      {showCracks && <CrackOverlay strength={crackStrength} />}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  );
}

// Red crack polylines ported from the collapsed reference SVG, scaled to the
// 200×72 node box. Rendered above the node content but below the borders.
function CrackOverlay({ strength }: { strength: number }) {
  return (
    <svg
      width={200}
      height={72}
      viewBox="0 0 200 72"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      <polyline points="18,0 50,26 30,42 74,72" fill="none" stroke="#ef4444" strokeWidth={1.8} opacity={0.9 * strength} />
      <polyline points="118,0 140,32 158,72" fill="none" stroke="#ef4444" strokeWidth={1.4} opacity={0.75 * strength} />
      <polyline points="70,0 92,20 84,72" fill="none" stroke="#ef4444" strokeWidth={1.2} opacity={0.6 * strength} />
    </svg>
  );
}
