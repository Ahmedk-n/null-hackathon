"use client";
import { motion } from "motion/react";
import { OK, WARN, BAD, HAIR } from "@/ui/tokens";

// Band color (plan §3): ≥60 ok · 35–59 warn · <35 bad.
function bandColor(value: number): string {
  if (value >= 60) return OK;
  if (value >= 35) return WARN;
  return BAD;
}

export function IntegrityGauge({ value }: { value: number }) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const dash = (clamped / 100) * circumference;
  const color = bandColor(value);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        {/* Hairline track. */}
        <circle cx={60} cy={60} r={r} fill="none" stroke={HAIR} strokeWidth={3} />
        <motion.circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          transform="rotate(-90 60 60)"
          animate={{ strokeDasharray: `${dash} ${circumference}` }}
          transition={{ duration: 0.6 }}
        />
        <text
          x={60}
          y={64}
          textAnchor="middle"
          fill={color}
          fontSize={30}
          fontFamily="var(--mono)"
          style={{ fontVariantNumeric: "tabular-nums" }}
          fontWeight={600}
        >
          {Math.round(value)}
        </text>
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
      <div className="label">Structural Integrity</div>
    </div>
  );
}
