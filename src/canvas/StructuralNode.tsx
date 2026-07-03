"use client";
import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { useState } from "react";
import type { NodeType, NodeEvidence } from "@/engine";
import {
  THESIS,
  CLAIM,
  ASSUMPTION,
  KEYSTONE,
  BAD,
  BAD_BG,
  PANEL,
  INK,
  INK_2,
  MUTED,
  HAIR_STRONG,
} from "@/ui/tokens";
import { LAYER_Z as STRATUM_Z, EVIDENCE_Z, KEYSTONE_Z_BUMP } from "./depth";

/**
 * Causal callout attached to the keystone when it cracks (W1-5). Sourced from real
 * DecisionContextPack data by `keystoneCalloutFor` — never hardcoded. `detail`/`reason`
 * are present only when a context adjustment actually moved the keystone's severity;
 * a bare `{ headline: "THRESHOLD CROSSED" }` is the neutral (raw-mode) case.
 */
export interface CausalCallout {
  headline: string;
  detail?: string;
  reason?: string;
}

export interface StructuralNodeData {
  label: string;
  type: NodeType;
  confidence: number;
  isKeystone: boolean;
  isFailed: boolean;
  /** Whether load is currently applied — gates the keystone tension telegraph. */
  loadApplied?: boolean;
  collapseDelay?: number;
  /** Assembly build-in delay (W1-6a) — staggers this node's entrance bottom-up. */
  buildDelay?: number;
  /** Whether to play the entrance animation this mount (first build of the graph only). */
  animateEntrance?: boolean;
  /** Blueprint causal annotation shown on the cracked keystone (W1-5). */
  causalCallout?: CausalCallout | null;
  /** Layer index (assumption 0 · claim 1 · thesis 2) — passed from the canvas. */
  layer?: number;
  /** Resting elevation in px (layer Z + keystone bump) — passed from the canvas. */
  translateZ?: number;
  /**
   * V4-1 · confidence provenance for the evidence stratum. An assumption with an
   * evidence object renders a source-plate BELOW it in the L3 stratum; an assumption
   * whose evidence is `null` is ungrounded and visibly FLOATS (a dashed drop-line to
   * nothing + an UNGROUNDED hover hint). Thesis/claims carry no evidence.
   */
  evidence?: NodeEvidence | null;
  /**
   * V5-3 · human-edit provenance. When "modified", the evidence plate DETACHES (the cited fact
   * no longer backs the edited belief) — the node reads MODIFIED — UNVERIFIED in the inspector.
   */
  provenance?: "modified";
  /** V4-1 · delay (s) for the evidence plate's collapse — plates fall LAST. */
  evidenceDropDelay?: number;
  /** V4-1 · stratum focus dimming: fade this node when another stratum is focused. */
  dimmed?: boolean;
  /** V4-1 · fade this node's evidence plate when a non-evidence stratum is focused. */
  plateDimmed?: boolean;
  [key: string]: unknown;
}

// Light-ledger accents per structural role (plan §1.1). Keystone overrides to red.
const ACCENT: Record<NodeType, string> = { thesis: THESIS, claim: CLAIM, assumption: ASSUMPTION };

// V4-1 — Z ENCODES reasoning depth (shared single source in ./depth): thesis highest,
// descending claims → assumptions → evidence. The canvas passes each node's resting
// elevation via data.translateZ; this stays as a fallback.
const LAYER_Z = STRATUM_Z;

// Accelerating "masonry" fall (W1-2): nodes speed up as they drop, unlike easeInOut.
const FALL_EASE = [0.7, 0, 0.84, 0] as const;

export function StructuralNode({ data }: { data: StructuralNodeData }) {
  const [hover, setHover] = useState(false);

  const accent = data.isKeystone ? KEYSTONE : ACCENT[data.type];
  const restingZ = data.translateZ ?? LAYER_Z[data.type] + (data.isKeystone ? KEYSTONE_Z_BUMP : 0);
  // V4-1 — stratum focus dims the strata you're not inspecting.
  const dimmed = data.dimmed ?? false;
  const restOpacity = dimmed ? 0.24 : 1;
  // The evidence plate sits on the L3 plane regardless of this node's own elevation.
  const plateZDelta = EVIDENCE_Z - restingZ;

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
  const buildDelay = data.buildDelay ?? 0;
  // Parallax lift on hover: +16px toward the viewer.
  const liveZ = restingZ + (hover ? 16 : 0);

  // W1-6a — entrance build-in: rise from below/behind, staggered bottom-up. Only when
  // the canvas flags the graph's first mount, and never for a node that mounts failed.
  const entrance = (data.animateEntrance ?? false) && !data.isFailed;

  return (
    <motion.div
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      initial={
        entrance
          ? { opacity: 0, y: 40, scale: 0.96, z: restingZ - 160, rotateX: 0, rotateY: 0, rotate: 0 }
          : false
      }
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
          : { opacity: restOpacity, rotateX: 0, rotateY: 0, rotate: 0, y: 0, z: liveZ, scale: 1 }
      }
      transition={
        data.isFailed
          ? { duration: 0.55, delay: collapseDelay, ease: FALL_EASE }
          : entrance
            ? { duration: 0.5, delay: buildDelay, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.4, ease: "easeOut" }
      }
      style={{
        transformStyle: "preserve-3d",
        position: "relative",
        width: 200,
        height: 72,
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        background: data.isFailed ? BAD_BG : PANEL,
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

      {/* W1-5 — causal callout: fades in AFTER the crack draws (~0.5s past collapse). */}
      {data.isKeystone && data.isFailed && data.causalCallout && (
        <CausalCalloutTag callout={data.causalCallout} appearDelay={collapseDelay + 0.5} />
      )}

      {/* V4-1 — evidence stratum (L3). A grounded assumption drops a source-plate onto
          the evidence plane below it; an ungrounded assumption floats over nothing.
          V5-3 — a human-MODIFIED node detaches its plate: the cited fact no longer backs it. */}
      {data.type === "assumption" && data.evidence != null && data.provenance !== "modified" && (
        <EvidencePlate
          evidence={data.evidence}
          zDelta={plateZDelta}
          isFailed={data.isFailed}
          entrance={entrance}
          buildDelay={buildDelay}
          dropDelay={data.evidenceDropDelay ?? collapseDelay + 0.6}
          dimmed={data.plateDimmed ?? false}
        />
      )}
      {data.type === "assumption" && data.evidence === null && !data.isFailed && (
        <UngroundedDrop hover={hover} dimmed={data.plateDimmed ?? false} />
      )}

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

// W1-5 — blueprint causal annotation attached to the cracked keystone: a hairline
// leader line from the node edge to an uppercase .mono, zero-radius, --bad label that
// reads the context→consequence link ("CRACKED · EXECUTION SEVERITY 0.43→0.65" + the
// real adjustment reason). Fades in after the crack has drawn.
function CausalCalloutTag({
  callout,
  appearDelay,
}: {
  callout: CausalCallout;
  appearDelay: number;
}) {
  return (
    <motion.div
      data-testid="causal-callout"
      className="mono"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: appearDelay, ease: "easeOut" }}
      style={{
        position: "absolute",
        left: 200,
        top: -10,
        width: 214,
        display: "flex",
        alignItems: "flex-start",
        pointerEvents: "none",
        borderRadius: 0,
      }}
    >
      {/* hairline leader line from the node edge to the label */}
      <svg width={22} height={20} viewBox="0 0 22 20" style={{ overflow: "visible", flex: "0 0 auto", marginTop: 8 }}>
        <circle cx={0} cy={10} r={1.6} fill={BAD} />
        <line x1={0} y1={10} x2={22} y2={10} stroke={BAD} strokeWidth={0.75} />
      </svg>
      <div style={{ borderLeft: `2px solid ${BAD}`, paddingLeft: 6, borderRadius: 0 }}>
        <div
          style={{
            color: BAD,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            lineHeight: 1.2,
          }}
        >
          {callout.headline}
        </div>
        {callout.detail && (
          <div style={{ color: INK, fontSize: 9, letterSpacing: "0.08em", marginTop: 2, lineHeight: 1.3 }}>
            {callout.detail}
          </div>
        )}
        {callout.reason && (
          <div style={{ color: MUTED, fontSize: 9, letterSpacing: "0.04em", marginTop: 2, lineHeight: 1.35 }}>
            {callout.reason.toUpperCase()}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// V4-1 — EVIDENCE PLATE (L3 stratum). A small CAD source-plate that sits on the
// evidence plane BELOW its assumption (translateZ pushes it down into L3), joined by a
// hairline vertical drop-line. Shows the truncated fact + the .mono provenance source
// (a file path, url, or "notes"). On collapse the plate drops away LAST (dropDelay is
// larger than any node's) — the ground truth falling out from under the structure.
function EvidencePlate({
  evidence,
  zDelta,
  isFailed,
  entrance,
  buildDelay,
  dropDelay,
  dimmed,
}: {
  evidence: NodeEvidence;
  zDelta: number;
  isFailed: boolean;
  entrance: boolean;
  buildDelay: number;
  dropDelay: number;
  dimmed: boolean;
}) {
  const fact = evidence.fact.length > 72 ? evidence.fact.slice(0, 69) + "…" : evidence.fact;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 72,
        transform: `translateZ(${zDelta}px)`,
        transformStyle: "preserve-3d",
        pointerEvents: "none",
      }}
    >
      {/* hairline vertical drop-line from the node's foot to the plate */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: 1,
          height: 16,
          background: HAIR_STRONG,
          transform: "translateX(-0.5px)",
        }}
      />
      <motion.div
        data-testid="evidence-plate"
        initial={entrance ? { opacity: 0, y: -6 } : false}
        animate={isFailed ? { opacity: 0, y: 30 } : { opacity: dimmed ? 0.28 : 1, y: 0 }}
        transition={
          isFailed
            ? { duration: 0.5, delay: dropDelay, ease: FALL_EASE }
            : entrance
              ? { duration: 0.45, delay: buildDelay + 0.25, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.3 }
        }
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          top: 16,
          border: `1px solid ${HAIR_STRONG}`,
          borderLeft: `2px solid ${ASSUMPTION}`,
          background: PANEL,
          padding: "3px 6px",
          borderRadius: 0,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 8,
            letterSpacing: "0.08em",
            color: MUTED,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {evidence.source}
        </div>
        <div style={{ fontSize: 9, color: INK_2, lineHeight: 1.3, marginTop: 1 }}>{fact}</div>
      </motion.div>
    </div>
  );
}

// V4-1 — an ungrounded assumption (evidence === null) has NO plate. It hangs a faint
// DASHED drop-line into the void — the visible tell of an unsupported belief — and
// surfaces an UNGROUNDED hint on hover. The absence is the feature.
function UngroundedDrop({ hover, dimmed }: { hover: boolean; dimmed: boolean }) {
  return (
    <div
      data-testid="ungrounded-drop"
      style={{
        position: "absolute",
        left: "50%",
        top: 72,
        transform: "translateX(-50%)",
        pointerEvents: "none",
        opacity: dimmed ? 0.3 : 0.85,
      }}
    >
      <svg width={2} height={30} viewBox="0 0 2 30" style={{ overflow: "visible", display: "block" }}>
        <line x1={1} y1={0} x2={1} y2={30} stroke={HAIR_STRONG} strokeWidth={1} strokeDasharray="2 3" />
      </svg>
      {hover && (
        <span
          className="mono"
          style={{
            position: "absolute",
            left: 6,
            top: 20,
            fontSize: 8,
            letterSpacing: "0.14em",
            color: MUTED,
            whiteSpace: "nowrap",
          }}
        >
          UNGROUNDED
        </span>
      )}
    </div>
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
