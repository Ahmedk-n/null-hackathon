"use client";
import { motion, useMotionValue, animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { ProbabilisticResult } from "@/engine";
// P2-T5 (additive): cross-decision calibration. Pure, key-free transform (data-in/data-out, no
// Date/Math.random) — safe to call in render, same idiom as the engine's other pure derivations
// already used in client tabs.
import { applyCalibration, type Calibration } from "@/engine/calibrate";
import { OK, WARN, BAD, HAIR, HAIR_STRONG, MUTED } from "@/ui/tokens";

// P2-T5 · one-line reading of the bias direction, named the way a founder would read it: a
// negative bias means resolved decisions held LESS often than the model predicted (the caller
// tends to over-hold / discount their own thesis's odds too optimistically); positive means the
// reverse (under-rate). Small |bias| reads as "well-calibrated" rather than forcing a direction
// onto noise.
//
// Phase 2 whole-feature fix (honesty bug): `isSample` is true ONLY for the guest/offline fixture
// (see fetchCalibration's CalibrationResult.isSample) — it must never be worded as the caller's
// own track record, so it gets its own illustrative-sample caption instead of the "your track
// record" lines below.
function calibrationReading(cal: Calibration, isSample: boolean): string {
  const n = `n=${cal.sampleCount}`;
  if (isSample) return `Illustrative sample calibration — resolve your own decisions to personalize · ${n}`;
  if (Math.abs(cal.bias) < 0.05) return `Well-calibrated · ${n}`;
  if (cal.bias < 0) return `Adjusted for your track record — you tend to over-hold · ${n}`;
  return `Adjusted for your track record — you tend to under-rate · ${n}`;
}

// The crater, not a snap: ring dash + numeral + color all glide over the same
// duration/ease so the number appears to *fall* into place (plan W1-1).
const DURATION = 0.9;
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Status bands (W1-1). Numeral, ring and status word share one source of truth
// so the gauge tells a single, coherent story:
//   HOLDING ≥ 35 (--ok) · STRESSED 10–35 (--warn) · FAILED < 10 (--bad).
function bandColor(value: number): string {
  if (value >= 35) return OK;
  if (value >= 10) return WARN;
  return BAD;
}
function statusWord(value: number): "HOLDING" | "STRESSED" | "FAILED" {
  if (value >= 35) return "HOLDING";
  if (value >= 10) return "STRESSED";
  return "FAILED";
}

// P(hold) is a probability of survival (0..1), not an integrity score, so it gets its own
// bands: a clear majority holds green, a coin-flip amber, an odds-against outcome red.
function pHoldColor(pHold: number): string {
  if (pHold >= 0.6) return OK;
  if (pHold >= 0.35) return WARN;
  return BAD;
}

// A muted, sentence-case one-liner that sits under a metric to say — in plain language — what it
// is and how it differs from the numbers around it. Deliberately NOT `.label` (that class forces
// uppercase/tracking, which reads as a heading, not an explanation).
const GLOSS: React.CSSProperties = {
  color: MUTED,
  fontSize: 10.5,
  lineHeight: 1.35,
  fontWeight: 400,
  maxWidth: 220,
  marginLeft: "auto",
  marginRight: "auto",
};

export function IntegrityGauge({
  value,
  probabilistic = null,
  calibration = null,
  calibrationIsSample = false,
  explain = false,
}: {
  value: number;
  /**
   * Task 7 · the Monte-Carlo distribution over the current structure. When present the gauge
   * LEADS with `HOLDS <pHold%>` (the headline the model actually believes) and a [p05–p95]
   * integrity band, and DEMOTES the deterministic `value` to the labelled "sketch" point
   * estimate (the ring stays, so the crater animation + status word are unchanged). When null
   * (before any solve) the gauge renders exactly as it always has.
   */
  probabilistic?: ProbabilisticResult | null;
  /**
   * P2-T5 · the caller's cross-decision track record. When present WITH a non-empty sample
   * (sampleCount > 0) AND a probabilistic result, the gauge adds a `RAW <pct>% → CALIBRATED
   * <pct>%` line plus a one-line bias reading beneath the HOLDS headline. Absent/empty sample →
   * raw-only (no calibrated claim rendered).
   */
  calibration?: Calibration | null;
  /**
   * Phase 2 whole-feature fix (honesty bug) · true ONLY when `calibration` is the guest/offline
   * illustrative fixture, never for a signed-in caller's real record. Swaps the caption beneath
   * the RAW→CALIBRATED line from "your track record" wording to an explicit "illustrative
   * sample" disclosure, so a fabricated bias is never attributed to the viewer.
   */
  calibrationIsSample?: boolean;
  /**
   * GRAPH verdict card only · when true the gauge renders a muted plain-language caption under
   * each metric (what P(hold), the sketch integrity, the band and the calibrated line each mean,
   * and how they differ). Off everywhere else (STRESS overlay, LIVE pipeline) so those compact
   * placements stay unchanged.
   */
  explain?: boolean;
}) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const dash = (clamped / 100) * circumference;
  const color = bandColor(value);
  const status = statusWord(value);

  // Numeral counts to the new value (synced with the ring dash) rather than
  // hard-swapping. SSR/first paint shows the rounded value immediately, so the
  // static contract holds even when no animation frame runs (jsdom).
  const count = useMotionValue(clamped);
  const [display, setDisplay] = useState(() => Math.round(clamped));
  useEffect(() => {
    const controls = animate(count, clamped, { duration: DURATION, ease: EASE });
    return () => controls.stop();
  }, [clamped, count]);
  useEffect(() => count.on("change", (v) => setDisplay(Math.round(v))), [count]);

  // Fire the shake exactly once per crossing INTO the failed band (≥10 → <10),
  // keyed off the band transition — never on every render, no timers/random.
  const containerRef = useRef<HTMLDivElement>(null);
  const wasFailed = useRef(value < 10);
  useEffect(() => {
    const failedNow = value < 10;
    if (failedNow && !wasFailed.current && containerRef.current) {
      const controls = animate(
        containerRef.current,
        { x: [0, -3, 3, -2, 2, 0] },
        { duration: 0.4, ease: "easeInOut" },
      );
      wasFailed.current = failedNow;
      return () => controls.stop();
    }
    wasFailed.current = failedNow;
  }, [value]);

  // Task 7 · probabilistic headline + band derivations (only when a distribution exists).
  const pHoldPct = probabilistic ? Math.round(probabilistic.pHold * 100) : null;
  const pColor = probabilistic ? pHoldColor(probabilistic.pHold) : color;
  const bandLo = probabilistic ? Math.round(probabilistic.band[0]) : null;
  const bandHi = probabilistic ? Math.round(probabilistic.band[1]) : null;

  // P2-T5 · RAW → CALIBRATED. Only when both a distribution AND a non-empty sample exist —
  // otherwise there is nothing honest to recalibrate against, so raw stands alone.
  const showCalibration = !!(probabilistic && calibration && calibration.sampleCount > 0);
  const calibratedPct =
    showCalibration && probabilistic && calibration
      ? Math.round(applyCalibration(probabilistic, calibration).calibratedPHold * 100)
      : null;

  return (
    <div ref={containerRef} style={{ textAlign: "center" }}>
      {/* HEADLINE — the number the model believes: fraction of Monte-Carlo runs that hold.
          Sits ABOVE the ring so it reads first; the ring below is demoted to the "sketch". */}
      {probabilistic && (
        <div data-testid="phold-headline" style={{ marginBottom: 8 }}>
          <div
            className="mono"
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.04em",
              lineHeight: 1,
              color: pColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {`HOLDS ${pHoldPct}%`}
          </div>
          <div className="label" style={{ marginTop: 3, color: MUTED, fontSize: 9 }}>
            P(hold) · Monte-Carlo
          </div>
        </div>
      )}
      {explain && probabilistic && (
        <div style={{ ...GLOSS, marginTop: -3, marginBottom: 9 }}>
          Probability the structure survives once real-world uncertainty is sampled.
        </div>
      )}
      {/* P2-T5 · RAW → CALIBRATED — the cross-decision track record applied to THIS structure's
          P(hold). Sits right beneath the HOLDS headline, ledger-styled (mono line + muted
          caption), and only renders once there is an actual sample to recalibrate against. */}
      {showCalibration && calibratedPct !== null && calibration && (
        <div data-testid="calibration-line" style={{ marginBottom: 8 }}>
          <div
            className="mono"
            style={{ fontSize: 12, color: MUTED, fontVariantNumeric: "tabular-nums" }}
          >
            {`RAW ${pHoldPct}% → CALIBRATED ${calibratedPct}%`}
          </div>
          <div className="label" style={{ marginTop: 2, color: MUTED, fontSize: 9 }}>
            {calibrationReading(calibration, calibrationIsSample)}
          </div>
        </div>
      )}
      {explain && showCalibration && (
        <div style={{ ...GLOSS, marginTop: -3, marginBottom: 9 }}>
          What the raw odds become after adjusting for past prediction accuracy.
        </div>
      )}
      <svg width={120} height={120} viewBox="0 0 120 120">
        {/* Hairline track. */}
        <circle cx={60} cy={60} r={r} fill="none" stroke={HAIR} strokeWidth={3} />
        <motion.circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          strokeWidth={3}
          transform="rotate(-90 60 60)"
          initial={false}
          animate={{ strokeDasharray: `${dash} ${circumference}`, stroke: color }}
          transition={{ duration: DURATION, ease: EASE }}
        />
        <motion.text
          x={60}
          y={64}
          textAnchor="middle"
          fontSize={30}
          fontFamily="var(--mono)"
          style={{ fontVariantNumeric: "tabular-nums" }}
          fontWeight={600}
          initial={false}
          animate={{ fill: color }}
          transition={{ duration: DURATION, ease: EASE }}
        >
          {display}
        </motion.text>
        <text
          x={60}
          y={82}
          textAnchor="middle"
          fill={color}
          fontSize={11}
          fontFamily="var(--mono)"
        >
          %
        </text>
      </svg>
      <div className="label" style={{ color }}>
        {status}
      </div>
      {/* When a distribution exists the ring is the deterministic "sketch" (point estimate);
          otherwise it is the sole integrity readout, labelled as before. */}
      <div className="label">
        {probabilistic ? "Sketch · Structural Integrity" : "Structural Integrity"}
      </div>
      {explain && (
        <div style={{ ...GLOSS, marginTop: 4 }}>
          How well the thesis is supported by its claims + assumptions right now (deterministic).
        </div>
      )}
      {/* INTEGRITY BAND — the [p05–p95] hairline range beneath the sketch, so the point value
          reads as one draw from a spread rather than a promise. */}
      {probabilistic && bandLo !== null && bandHi !== null && (
        <div
          data-testid="integrity-band"
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: `1px solid ${HAIR_STRONG}`,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span className="label" style={{ color: MUTED }}>
            Integrity Band
          </span>
          <span className="mono" style={{ fontSize: 12, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
            {`${bandLo}–${bandHi}`}
          </span>
        </div>
      )}
      {explain && probabilistic && (
        <div style={{ ...GLOSS, marginTop: 5 }}>
          The p05–p95 range — where integrity landed across the sampled runs.
        </div>
      )}
    </div>
  );
}
