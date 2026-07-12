"use client";
import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { useState } from "react";
import type { NodeType, NodeEvidence } from "@/engine";
// Crack/debris SVG overlays keep the JS token reds; the node's clean-modern frame,
// eyebrow and evidence plate now use theme-aware CSS vars (see `V` below).
import { KEYSTONE, BAD, INK, MUTED } from "@/ui/tokens";
import { LAYER_Z as STRATUM_Z, EVIDENCE_Z, KEYSTONE_Z_BUMP } from "./depth";

// V9-1 · minimalist node box — smaller/cleaner than the old 200×72. The evidence plate,
// crack overlay and ungrounded drop derive their offsets from these so the box can shrink
// without re-authoring the geometry.
// T3 — narrowed to 150 (kept in lockstep with layout.ts NODE_W) so a 7-wide rank stops
// forcing the fit to shrink to nothing; height bumped to 68 so a 2-line label at the raised
// font still clears the box. The narrower box wraps the label sooner but the 2-line clamp +
// hover title keep it legible and lossless.
const NODE_W = 150;
const NODE_H = 68;

// Clean-modern (2026-07 redesign) palette — theme-aware CSS vars so the node reads on
// the new white cards in light + dark. The imported JS token constants stay in use for
// the crack/debris SVG overlays (hardcoded reds) below.
const V = {
  thesis: "var(--thesis)",
  claim: "var(--claim)",
  assumption: "var(--assumption)",
  keystone: "var(--keystone)",
  accent: "var(--accent)",
  bad: "var(--bad)",
  badBg: "var(--bad-bg)",
  panel: "var(--panel)",
  ink: "var(--ink)",
  muted: "var(--muted)",
  hairStrong: "var(--hair-strong)",
  ok: "var(--ok)",
  warn: "var(--warn)",
} as const;

// V9-1 · a single integrity/status dot replaces the always-on confidence readout at rest.
// green = grounded/high, amber = soft, red = weak or failed.
function statusColor(confidence: number, isFailed: boolean): string {
  if (isFailed) return V.bad;
  if (confidence >= 0.66) return V.ok;
  if (confidence >= 0.4) return V.warn;
  return V.bad;
}

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
   * V4-1 · confidence provenance for the evidence stratum. An assumption with
   * evidence renders a source-plate BELOW it in the L3 stratum; an assumption
   * whose evidence is `null` is ungrounded and visibly FLOATS (a dashed drop-line to
   * nothing + an UNGROUNDED hover hint). Thesis/claims carry no evidence.
   * V7-4 · evidence is a multi-citation ARRAY — the plate shows the primary supporting fact
   * plus, when present, a contradicting one styled in --bad. Engine-inert.
   */
  evidence?: NodeEvidence[] | null;
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
  /**
   * V9-1 · PROGRESSIVE DISCLOSURE. When false (the minimal GRAPH default) the node
   * shows only a short label + a status dot + the keystone/failed marker; the confidence
   * number, evidence plate and ungrounded drop stay HIDDEN (the full detail lives in the
   * SelectionPanel). Defaults true so STRESS and the existing canvas contract keep the
   * rich rendering.
   */
  detail?: boolean;
  /**
   * V9-1 · this node is the current selection — expands its confidence inline and draws a
   * selection ring even while the board is in minimal (detail-off) mode.
   */
  selected?: boolean;
  /**
   * Task 7 · dominant-driver cluster colour (assumptions only). When present the node tints its
   * load-bearing LEFT edge to this colour, grouping assumptions that share a latent failure
   * driver; the GRAPH rail carries the matching driver→colour legend. Undefined → type accent.
   */
  clusterColor?: string;
  clusterLabel?: string;
  [key: string]: unknown;
}

// Accent per structural role (clean-modern). Keystone overrides to red, thesis to accent.
const ACCENT: Record<NodeType, string> = { thesis: V.thesis, claim: V.claim, assumption: V.assumption };

// V4-1 — Z ENCODES reasoning depth (shared single source in ./depth): thesis highest,
// descending claims → assumptions → evidence. The canvas passes each node's resting
// elevation via data.translateZ; this stays as a fallback.
const LAYER_Z = STRATUM_Z;

// Accelerating "masonry" fall (W1-2): nodes speed up as they drop, unlike easeInOut.
const FALL_EASE = [0.7, 0, 0.84, 0] as const;

export function StructuralNode({ data }: { data: StructuralNodeData }) {
  const [hover, setHover] = useState(false);

  // V9-1 · progressive disclosure. `detail` (the global DETAIL toggle) reveals the full
  // node; a `selected` node expands inline even while the board stays minimal. At rest
  // the board is quiet: dot + label + keystone/failed marker only.
  const showDetail = data.detail ?? true;
  const selected = data.selected ?? false;
  const expand = showDetail || selected;

  const accent = data.isKeystone ? V.keystone : ACCENT[data.type];
  // Clean-modern frame: soft neutral border for claims/assumptions; the type colour only
  // paints the frame for the two load-bearing roles (thesis → accent, keystone → red). A
  // failed node's red frame always wins (failure signal is never overridden).
  const frameColor = data.isFailed
    ? V.bad
    : data.isKeystone
      ? V.keystone
      : data.type === "thesis"
        ? V.accent
        : V.hairStrong;
  // Task 7 · a tagged assumption keeps a colored 3px LEFT edge = its dominant-driver cluster,
  // so the board still reads its shared-failure grouping; untagged nodes stay a clean uniform
  // frame (matches the mockup's plain rounded boxes).
  const clusterEdge = !data.isFailed && !data.isKeystone && data.clusterColor;
  const dotColor = statusColor(data.confidence, data.isFailed);
  const restingZ = data.translateZ ?? LAYER_Z[data.type] + (data.isKeystone ? KEYSTONE_Z_BUMP : 0);
  // V4-1 — stratum focus dims the strata you're not inspecting.
  const dimmed = data.dimmed ?? false;
  const restOpacity = dimmed ? 0.24 : 1;
  // The evidence plate sits on the L3 plane regardless of this node's own elevation.
  const plateZDelta = EVIDENCE_Z - restingZ;

  // Clean-modern: the standing keystone stays clean (red frame + ring carry the signal);
  // cracks draw only on actual failure (the attacked state). A failed keystone shatters hardest.
  const showCracks = data.isFailed;
  const crackStrength = data.isFailed && data.isKeystone ? 1 : 0.75;

  // Clean-modern elevation: a soft card shadow at rest; the keystone adds a red-weak ring
  // (matches the mockup). The keystone's outer rim glow is owned by <KeystoneGlow/> (W1-7).
  const restingShadow = data.isKeystone
    ? "0 0 0 3px var(--bad-bg), var(--shadow-sm)"
    : "var(--shadow-sm)";
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
              // Buckle toward the viewer as a TRANSIENT (through ~42°) then SETTLE back to a
              // near-flat, legible resting frame — the red BAD_BG + failed shadow + cracks +
              // FAILED chip carry the failure signal, so the label/values stay readable.
              opacity: [null, 0.55, 0.95],
              rotateX: [null, 42, 8],
              rotateY: 0,
              rotate:
                data.type === "thesis"
                  ? [null, -2, -1]
                  : data.type === "claim"
                    ? [null, -6, -1.5]
                    : [null, -4, -1.5],
              y: [null, 22, 8],
              z: [null, -70, -20],
            }
          : { opacity: restOpacity, rotateX: 0, rotateY: 0, rotate: 0, y: 0, z: liveZ, scale: 1 }
      }
      transition={
        data.isFailed
          ? { duration: 0.85, delay: collapseDelay, times: [0, 0.5, 1], ease: "easeInOut" }
          : entrance
            ? { duration: 0.5, delay: buildDelay, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.4, ease: "easeOut" }
      }
      data-expanded={expand ? "true" : undefined}
      style={{
        transformStyle: "preserve-3d",
        position: "relative",
        width: NODE_W,
        height: NODE_H,
        borderRadius: "var(--radius)",
        border: `1px solid ${frameColor}`,
        borderLeft: clusterEdge ? `3px solid ${data.clusterColor}` : `1px solid ${frameColor}`,
        background: data.isFailed ? V.badBg : V.panel,
        boxShadow: data.isFailed ? failedShadow : restingShadow,
        // V9-1 · a selected node draws a calm accent ring so the board still reads which node the
        // SelectionPanel is describing, without adding on-canvas text.
        outline: selected && !data.isFailed ? `1.5px solid ${V.accent}` : undefined,
        outlineOffset: 2,
        filter: hover && !data.isFailed ? "brightness(1.02)" : "none",
        padding: "8px 10px",
        boxSizing: "border-box",
        color: V.ink,
      }}
    >
      {/* W1-7 — keystone tension telegraph: breathing pulse under load, bright flare
          on failure. Sits behind the content, owns the keystone's outer glow. */}
      {data.isKeystone && (
        <KeystoneGlow loadApplied={data.loadApplied ?? false} isFailed={data.isFailed} />
      )}

      <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--sans)",
          fontSize: 9,
          fontWeight: 650,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: data.isFailed ? V.bad : data.isKeystone ? V.keystone : V.muted,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {/* V9-1 · integrity/status dot — the always-on health signal (green/amber/red). */}
          <span
            data-testid="node-status-dot"
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: dotColor,
              flex: "0 0 auto",
            }}
          />
          {/* Keystone/failed are load-bearing signals — always shown. The plain type label
              only appears once the node is expanded, so a resting board stays quiet. */}
          {(data.isFailed || data.isKeystone || expand) && (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data.isFailed ? "FAILED" : data.isKeystone ? "KEYSTONE" : data.type}
            </span>
          )}
        </span>
        {expand && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: data.isFailed ? V.bad : V.muted,
              flex: "0 0 auto",
              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            {`conf ${data.confidence.toFixed(2)}`}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--sans)",
          // T3 — 13px (up from 12): the fit now lands at a higher zoom, so the label reads
          // without a manual zoom; the 2-line clamp below still guards the box height.
          fontSize: 13,
          marginTop: 4,
          lineHeight: 1.25,
          // Clamp to 2 lines so a long label can't spill past the 68px box toward the
          // evidence plate below. Keep the clamp on the LABEL only — putting overflow
          // on the node box would clip the absolutely-positioned plate/glow/callout.
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={data.label}
      >
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
      {showDetail && data.type === "assumption" && data.evidence != null && data.evidence.length > 0 && data.provenance !== "modified" && (
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
      {showDetail && data.type === "assumption" && data.evidence === null && !data.isFailed && (
        <UngroundedDrop hover={hover} dimmed={data.plateDimmed ?? false} />
      )}

      <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
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
      width={NODE_W}
      height={NODE_H}
      viewBox="0 0 200 72"
      preserveAspectRatio="none"
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
        left: NODE_W,
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
  evidence: NodeEvidence[];
  zDelta: number;
  isFailed: boolean;
  entrance: boolean;
  buildDelay: number;
  dropDelay: number;
  dimmed: boolean;
}) {
  // V7-4 · a multi-citation plate. Primary = first SUPPORTING citation (else the first). A
  // CONTRADICTING citation, when present, is stacked below in --bad — surfacing conflicting
  // evidence instead of dropping it. One plate wrapper per node (data-testid=evidence-plate).
  const primary = evidence.find((e) => e.stance !== "contradicts") ?? evidence[0];
  const contra = evidence.find((e) => e.stance === "contradicts");
  const clip = (s: string) => (s.length > 72 ? s.slice(0, 69) + "…" : s);
  const fact = clip(primary.fact);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: NODE_H,
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
          background: V.hairStrong,
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
          border: `1px solid ${V.hairStrong}`,
          borderLeft: `2px solid ${V.assumption}`,
          background: V.panel,
          padding: "4px 7px",
          borderRadius: "var(--radius-sm)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 8,
            letterSpacing: "0.08em",
            color: V.muted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {primary.source}
        </div>
        <div style={{ fontSize: 9, color: "var(--ink-2)", lineHeight: 1.3, marginTop: 1 }}>{fact}</div>
        {contra && (
          <div
            data-testid="evidence-contradicts"
            style={{ marginTop: 3, paddingTop: 3, borderTop: `1px solid ${V.badBg}` }}
          >
            <div
              className="mono"
              style={{ fontSize: 8, letterSpacing: "0.1em", color: V.bad }}
            >
              CONTRADICTS · {contra.source}
            </div>
            <div style={{ fontSize: 9, color: V.bad, lineHeight: 1.3, marginTop: 1 }}>
              {clip(contra.fact)}
            </div>
          </div>
        )}
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
        top: NODE_H,
        transform: "translateX(-50%)",
        pointerEvents: "none",
        opacity: dimmed ? 0.3 : 0.85,
      }}
    >
      <svg width={2} height={30} viewBox="0 0 2 30" style={{ overflow: "visible", display: "block" }}>
        <line x1={1} y1={0} x2={1} y2={30} stroke={V.hairStrong} strokeWidth={1} strokeDasharray="2 3" />
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
            color: V.muted,
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
