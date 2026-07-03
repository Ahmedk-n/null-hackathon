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
  /** Whether load is currently applied — gates the keystone tension telegraph. */
  loadApplied?: boolean;
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

// Accelerating "masonry" fall (W1-2): nodes speed up as they drop, unlike easeInOut.
const FALL_EASE = [0.7, 0, 0.84, 0] as const;

export function StructuralNode({ data }: { data: StructuralNodeData }) {
  const [hover, setHover] = useState(false);

  const accent = data.isKeystone ? KEYSTONE : ACCENT[data.type];
  const restingZ = data.translateZ ?? LAYER_Z[data.type] + (data.isKeystone ? 18 : 0);

  const showCracks = data.isFailed || data.isKeystone;
  // A failed keystone shatters hardest.
  const crackStrength = data.isFailed && data.isKeystone ? 1 : data.isKeystone ? 0.55 : 0.75;

  // Contact shadow grows with elevation → stacked-plates depth. The keystone's outer
  // rim glow is owned by <KeystoneGlow/> (W1-7); the node keeps just the inset ring.
  const contact = `0 ${6 + restingZ / 4}px ${10 + restingZ / 3}px rgba(26,26,21,0.16)`;
  const keystoneRing = "inset 0 0 0 1px rgba(178,58,46,0.35)";
  const restingShadow = data.isKeystone ? `${keystoneRing}, ${contact}` : contact;
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
      transition={
        data.isFailed
          ? { duration: 0.55, delay: collapseDelay, ease: FALL_EASE }
          : { duration: 0.4, ease: "easeOut" }
      }
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
      {/* W1-7 — keystone tension telegraph: breathing pulse under load, bright flare
          on failure. Sits behind the content, owns the keystone's outer glow. */}
      {data.isKeystone && (
        <KeystoneGlow loadApplied={data.loadApplied ?? false} isFailed={data.isFailed} />
      )}

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

      {showCracks && (
        <CrackOverlay strength={crackStrength} drawDelay={data.isFailed ? collapseDelay : 0} />
      )}

      {/* W1-3 — debris flung from the keystone at its failure moment. */}
      {data.isKeystone && data.isFailed && <KeystoneDebris delay={collapseDelay} />}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  );
}

// Red crack polylines scaled to the 200×72 node box. Each self-draws (W1-3) by
// animating strokeDashoffset full→0 on a normalized pathLength, staggered ~0.1s apart.
function CrackOverlay({ strength, drawDelay = 0 }: { strength: number; drawDelay?: number }) {
  const lines = [
    { points: "18,0 50,26 30,42 74,72", stroke: KEYSTONE, width: 1.8, opacity: 0.9 * strength },
    { points: "118,0 140,32 158,72", stroke: BAD, width: 1.4, opacity: 0.75 * strength },
    { points: "70,0 92,20 84,72", stroke: KEYSTONE, width: 1.2, opacity: 0.6 * strength },
  ];
  return (
    <svg
      width={200}
      height={72}
      viewBox="0 0 200 72"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
    >
      {lines.map((l, i) => (
        <motion.polyline
          key={i}
          points={l.points}
          fill="none"
          stroke={l.stroke}
          strokeWidth={l.width}
          pathLength={1}
          strokeDasharray={1}
          initial={{ strokeDashoffset: 1, opacity: 0 }}
          animate={{ strokeDashoffset: 0, opacity: l.opacity }}
          transition={{ duration: 0.3, delay: drawDelay + i * 0.1, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
}

// Deterministic shard trajectories (W1-3, GOAL T8 — no Math.random). Angles in
// degrees around the node centre; distance/size/spin precomputed per shard.
const KEYSTONE_SHARDS = [
  { angle: 18, dist: 46, size: 5, spin: 160 },
  { angle: 78, dist: 40, size: 3, spin: -130 },
  { angle: 134, dist: 54, size: 6, spin: 210 },
  { angle: 198, dist: 42, size: 2, spin: -170 },
  { angle: 256, dist: 50, size: 4, spin: 190 },
  { angle: 322, dist: 44, size: 3, spin: -210 },
] as const;

function KeystoneDebris({ delay = 0 }: { delay?: number }) {
  return (
    <>
      {KEYSTONE_SHARDS.map((s, i) => {
        const rad = (s.angle * Math.PI) / 180;
        return (
          <motion.div
            key={i}
            aria-hidden
            initial={{ x: 0, y: 0, rotate: 0, opacity: 0.95 }}
            animate={{ x: Math.cos(rad) * s.dist, y: Math.sin(rad) * s.dist, rotate: s.spin, opacity: 0 }}
            transition={{ duration: 0.6, delay, ease: "easeOut" }}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: s.size,
              height: s.size,
              background: BAD,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
}

// Keystone tension telegraph (W1-7): breathing red pulse while load is applied and
// the keystone still holds; a single bright flare at the instant it fails; a calm
// static rim otherwise. Owns the keystone's outer glow so states cross-fade cleanly.
function KeystoneGlow({ loadApplied, isFailed }: { loadApplied: boolean; isFailed: boolean }) {
  const breathe = loadApplied && !isFailed;
  return (
    <motion.div
      aria-hidden
      initial={false}
      animate={
        isFailed
          ? {
              boxShadow: [
                "0 0 30px 6px rgba(178,58,46,0.9)",
                "0 0 16px 2px rgba(178,58,46,0.55)",
              ],
            }
          : breathe
            ? {
                boxShadow: [
                  "0 0 8px 0px rgba(178,58,46,0.35)",
                  "0 0 20px 4px rgba(178,58,46,0.75)",
                  "0 0 8px 0px rgba(178,58,46,0.35)",
                ],
              }
            : { boxShadow: "0 0 14px 0px rgba(178,58,46,0.55)" }
      }
      transition={
        isFailed
          ? { duration: 0.25, ease: "easeOut" }
          : breathe
            ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
      }
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
