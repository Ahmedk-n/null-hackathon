"use client";
import { motion } from "motion/react";

function color(value: number): string {
  if (value >= 60) return "#22c55e";
  if (value >= 35) return "#f59e0b";
  return "#ef4444";
}

export function IntegrityGauge({ value }: { value: number }) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#232c39" strokeWidth={12} />
        <motion.circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          stroke={color(value)}
          strokeWidth={12}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          animate={{ strokeDasharray: `${dash} ${circumference}` }}
          transition={{ duration: 0.6 }}
        />
        <text x={60} y={68} textAnchor="middle" fill={color(value)} fontSize={28} fontWeight={700}>
          {Math.round(value)}%
        </text>
      </svg>
      <div style={{ color: "#8b98a5", fontSize: 11, letterSpacing: 1.5 }}>STRUCTURAL INTEGRITY</div>
    </div>
  );
}
