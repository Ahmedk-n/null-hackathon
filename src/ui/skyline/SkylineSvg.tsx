"use client";
// V6-3 · SKYLINE SVG — the whole library as one structure. Buildings are stacked-rect towers
// (height ∝ nodeCount), glowing by integrity band; shared foundations are labeled columns beneath
// the ground line, spanning their member buildings with hairline connectors up into each one.
// Deterministic geometry: NO wall-clock, NO randomness. Animation is pure CSS transition on the
// cracked-building transform/filter, so the static SSR/jsdom render is fully faithful.
import type { CSSProperties } from "react";
import type { SharedFoundation, SkylineBuilding, CrackResult } from "@/lib/skyline";
import { HOLDING_THRESHOLD } from "@/lib/skyline";
import { OK, WARN, BAD, HAIR, HAIR_STRONG, INK, MUTED, PANEL, KEYSTONE } from "@/ui/tokens";

const BUILDING_W = 88;
const GAP = 62;
const MARGIN_X = 52;
const FLOOR_H = 15;
const TOP_MARGIN = 44;
const NAMEPLATE_H = 40;
const FOUND_ROW_H = 34;
const DROP = 9; // px a collapsed building sinks

// Integrity band → glow color (same 35/10 thresholds as the gauge · HOLDING/STRESSED/FAILED).
function bandColor(v: number): string {
  if (v >= HOLDING_THRESHOLD) return OK;
  if (v >= 10) return WARN;
  return BAD;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function SkylineSvg({
  buildings,
  foundations,
  crackResults,
  selectedFoundationId,
  onCrack,
}: {
  buildings: SkylineBuilding[];
  foundations: SharedFoundation[];
  crackResults: CrackResult[];
  selectedFoundationId: string | null;
  onCrack: (id: string) => void;
}) {
  const n = buildings.length;
  const maxFloors = Math.max(1, ...buildings.map((b) => b.nodeCount));
  const groundY = TOP_MARGIN + maxFloors * FLOOR_H;
  const foundY0 = groundY + NAMEPLATE_H + 14;
  const svgW = MARGIN_X * 2 + n * BUILDING_W + Math.max(0, n - 1) * GAP;
  const svgH = foundY0 + Math.max(1, foundations.length) * FOUND_ROW_H + 20;

  const xLeft = (i: number) => MARGIN_X + i * (BUILDING_W + GAP);
  const centerOf = (i: number) => xLeft(i) + BUILDING_W / 2;

  // entryId → building index / center (for foundation connectors).
  const indexOf = new Map<string, number>();
  buildings.forEach((b, i) => indexOf.set(b.entryId, i));

  // entryId → post-crack result (present only while a foundation is cracked).
  const resultOf = new Map<string, CrackResult>();
  for (const r of crackResults) resultOf.set(r.entryId, r);

  return (
    <svg
      data-testid="skyline-svg"
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: svgW, fontFamily: "var(--mono)" }}
      role="img"
      aria-label="Skyline of saved decisions with shared foundations"
    >
      {/* ── Ground line ─────────────────────────────────────────────── */}
      <line x1={16} y1={groundY} x2={svgW - 16} y2={groundY} stroke={HAIR_STRONG} strokeWidth={1} />
      <text x={20} y={groundY - 5} fontSize={9} fill={MUTED} style={{ letterSpacing: "0.12em" }}>
        GROUND
      </text>

      {/* ── Buildings ───────────────────────────────────────────────── */}
      {buildings.map((b, i) => {
        const height = b.nodeCount * FLOOR_H;
        const top = groundY - height;
        const res = resultOf.get(b.entryId);
        const cracked = res != null;
        const effIntegrity = res ? res.integrityAfter : b.integrity;
        const color = bandColor(effIntegrity);
        const failed = cracked && res!.failed;
        const gStyle: CSSProperties = {
          transform: failed ? `translateY(${DROP}px)` : "translateY(0)",
          transition: "transform 0.5s ease, filter 0.5s ease",
          filter: `drop-shadow(0 0 5px ${color}${failed ? "" : "88"})`,
          opacity: failed ? 0.55 : 1,
        };
        const floors = Array.from({ length: b.nodeCount });
        return (
          <g key={b.entryId} data-testid="skyline-building" data-entry-id={b.entryId} data-failed={failed ? "true" : "false"}>
            <g style={gStyle}>
              <rect x={xLeft(i)} y={top} width={BUILDING_W} height={height} fill={PANEL} stroke={color} strokeWidth={1.5} />
              {/* stacked floor hairlines */}
              {floors.map((_, f) => (
                <line
                  key={f}
                  x1={xLeft(i)}
                  y1={top + f * FLOOR_H}
                  x2={xLeft(i) + BUILDING_W}
                  y2={top + f * FLOOR_H}
                  stroke={color}
                  strokeOpacity={0.28}
                  strokeWidth={1}
                />
              ))}
              {/* keystone floor accent (the load-bearing course) */}
              <rect x={xLeft(i)} y={groundY - FLOOR_H} width={BUILDING_W} height={FLOOR_H} fill={color} fillOpacity={0.14} />
            </g>
            {/* nameplate — mono title + integrity %, beneath the ground (stays put) */}
            <text x={centerOf(i)} y={groundY + 15} textAnchor="middle" fontSize={9} fill={INK} style={{ letterSpacing: "0.04em" }}>
              {truncate(b.title, 16)}
            </text>
            <text x={centerOf(i)} y={groundY + 29} textAnchor="middle" fontSize={12} fontWeight={600} fill={color}>
              {Math.round(effIntegrity)}%
            </text>
          </g>
        );
      })}

      {/* ── Shared foundations (columns beneath the ground) ─────────── */}
      {foundations.map((f, j) => {
        const barY = foundY0 + j * FOUND_ROW_H;
        const centers = f.members
          .map((m) => indexOf.get(m.entryId))
          .filter((i): i is number => i != null)
          .map(centerOf);
        if (centers.length === 0) return null;
        const minC = Math.min(...centers);
        const maxC = Math.max(...centers);
        const selected = selectedFoundationId === f.id;
        const barColor = selected ? KEYSTONE : HAIR_STRONG;
        return (
          <g
            key={f.id}
            data-testid="skyline-foundation"
            data-foundation-id={f.id}
            role="button"
            tabIndex={0}
            onClick={() => onCrack(f.id)}
            style={{ cursor: "pointer" }}
          >
            {/* hairline connectors up into each member building */}
            {centers.map((cx, k) => (
              <line
                key={k}
                x1={cx}
                y1={groundY}
                x2={cx}
                y2={barY}
                stroke={selected ? KEYSTONE : HAIR}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            ))}
            {/* the foundation column bar spanning its members */}
            <rect x={minC - 8} y={barY} width={maxC - minC + 16} height={14} fill={selected ? "#f6ecea" : PANEL} stroke={barColor} strokeWidth={selected ? 1.5 : 1} />
            <text x={minC - 8} y={barY + 27} fontSize={9} fill={selected ? KEYSTONE : MUTED} style={{ letterSpacing: "0.04em" }}>
              {truncate(f.label, 30)} · {f.count}▲
            </text>
          </g>
        );
      })}
    </svg>
  );
}
