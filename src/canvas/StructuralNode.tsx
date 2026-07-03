"use client";
import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { useState } from "react";
import type { NodeType } from "@/engine";
import { THESIS, CLAIM, ASSUMPTION, KEYSTONE, BAD, PANEL, INK, MUTED } from "@/ui/tokens";

export interface StructuralNodeData {
  label: string;
  type: NodeType;
  confidence: number;
  isKeystone: boolean;
  isFailed: boolean;
  collapseDelay?: number;
  /** Layer index (assumption 0 · claim 1 · thesis 2) — passed from the canvas. */
  layer?: number;
  /** Resting elevation in px (layer Z + keystone bump) — passed from the canvas. */
  translateZ?: number;
  [key: string]: unknown;
}

// Light-ledger accents per structural role (plan §1.1). Keystone overrides to red.
const ACCENT: Record<NodeType, string> = { thesis: THESIS, claim: CLAIM, assumption: ASSUMPTION };

// Elevation by layer (plan §4): assumptions are the foundation (z=0), claims mid,
// thesis raised. The canvas passes this via data.translateZ; kept here as a fallback.
const LAYER_Z: Record<NodeType, number> = { assumption: 0, claim: 28, thesis: 56 };

export function StructuralNode({ data }: { data: StructuralNodeData }) {
  const [hover, setHover] = useState(false);

  const accent = data.isKeystone ? KEYSTONE : ACCENT[data.type];
  const restingZ = data.translateZ ?? LAYER_Z[data.type] + (data.isKeystone ? 18 : 0);

  const showCracks = data.isFailed || data.isKeystone;
  // A failed keystone shatters hardest.
  const crackStrength = data.isFailed && data.isKeystone ? 1 : data.isKeystone ? 0.55 : 0.75;

  // Contact shadow grows with elevation → stacked-plates depth. Keystone adds a red rim-light.
  const contact = `0 ${6 + restingZ / 4}px ${10 + restingZ / 3}px rgba(26,26,21,0.16)`;
  const keystoneGlow = "0 0 14px rgba(178,58,46,0.55), inset 0 0 0 1px rgba(178,58,46,0.35)";
  const restingShadow = data.isKeystone ? `${keystoneGlow}, ${contact}` : contact;
  const failedShadow = `0 0 18px rgba(178,58,46,0.5), 0 16px 26px rgba(26,26,21,0.28)`;

  const collapseDelay = data.collapseDelay ?? 0;
  // Parallax lift on hover: +16px toward the viewer.
  const liveZ = restingZ + (hover ? 16 : 0);

  return (
    <motion.div
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      initial={false}
      animate={
        data.isFailed
          ? {
              // Buckle toward the viewer: drop, rotate off-axis, and sink in Z.
              opacity: 0.4,
              rotateX: 42,
              rotateY: data.type === "thesis" ? -6 : data.type === "claim" ? -12 : -8,
              rotate: data.type === "thesis" ? -2 : data.type === "claim" ? -8 : -4,
              y: 18,
              z: -70,
            }
          : { opacity: 1, rotateX: 0, rotateY: 0, rotate: 0, y: 0, z: liveZ }
      }
      transition={{ duration: 0.55, delay: data.isFailed ? collapseDelay : 0, ease: "easeInOut" }}
      style={{
        transformStyle: "preserve-3d",
        position: "relative",
        width: 200,
        height: 72,
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        background: data.isFailed ? "#f6ecea" : PANEL,
        boxShadow: data.isFailed ? failedShadow : restingShadow,
        filter: hover && !data.isFailed ? "brightness(1.04)" : "none",
        padding: 8,
        boxSizing: "border-box",
        color: INK,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontFamily: "var(--sans)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: accent,
        }}
      >
        <span>{data.isFailed ? "FAILED" : data.isKeystone ? "KEYSTONE" : data.type}</span>
        <span
          className="mono"
          style={{ fontSize: 10, color: data.isFailed ? BAD : MUTED }}
        >
          {data.confidence.toFixed(2)}
        </span>
      </div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 12, marginTop: 6, lineHeight: 1.25 }}>
        {data.label}
      </div>

      {showCracks && <CrackOverlay strength={crackStrength} />}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  );
}

// Red crack polylines scaled to the 200×72 node box, recolored to the keystone/bad red.
function CrackOverlay({ strength }: { strength: number }) {
  return (
    <svg
      width={200}
      height={72}
      viewBox="0 0 200 72"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      <polyline points="18,0 50,26 30,42 74,72" fill="none" stroke={KEYSTONE} strokeWidth={1.8} opacity={0.9 * strength} />
      <polyline points="118,0 140,32 158,72" fill="none" stroke={BAD} strokeWidth={1.4} opacity={0.75 * strength} />
      <polyline points="70,0 92,20 84,72" fill="none" stroke={KEYSTONE} strokeWidth={1.2} opacity={0.6 * strength} />
    </svg>
  );
}
