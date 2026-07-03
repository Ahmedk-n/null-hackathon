"use client";
import { motion, useMotionValue, animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { OK, WARN, BAD, HAIR } from "@/ui/tokens";

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

export function IntegrityGauge({ value }: { value: number }) {
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

  return (
    <div ref={containerRef} style={{ textAlign: "center" }}>
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
      <div className="label">Structural Integrity</div>
    </div>
  );
}
