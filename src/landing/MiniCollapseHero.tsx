"use client";
// V5-1 · LIVE MINI-COLLAPSE HERO — an auto-playing ~12s deterministic loop of the
// hero-A structure (fixtureContextGraph): assemble bottom-up → APPLY LOAD (the
// integrity gauge counts 62→6 as the keystone k_credible cracks) → DE-RISK (the
// keystone restores, gauge climbs to ~51) → reset → loop.
//
// PURE + LOCAL only. It imports the pure engine + context fixtures directly (they carry
// no key, no wall-clock, no randomness — client-safe) and drives the phases from a single
// tick counter advanced by setInterval. It NEVER touches the global keystoneStore, and
// contains NO Math.random / Date.now / new Date( (GOAL T8). Cleanup-safe: the interval is
// cleared on unmount. All displayed numbers are the real engine's output on the fixture.
import { useEffect, useMemo, useState } from "react";
import {
  applyAttacks,
  detectFailures,
  integrity,
  keystone,
  type Attack,
  type Graph,
} from "@/engine";
import {
  fixtureContextAttacks,
  fixtureContextGraph,
  fixtureDecisionContextPack,
} from "@/context/fixtures";
import { reweightAttacksByContext } from "@/context/weights";
import { BAD, CLAIM, HAIR, HAIR_STRONG, INK, KEYSTONE, MUTED, OK, PANEL, THESIS, WARN } from "@/ui/tokens";

// ── Timeline (one tick = 80ms · 150 ticks = 12.0s) ──────────────────────────
const TICK_MS = 80;
const TOTAL_TICKS = 150;
// Phase boundaries (ticks).
const LOAD_START = 52;
const LOAD_END = 82;
const COLLAPSE_END = 100;
const DERISK_END = 126;
const HEAL_END = 140; // [140,150) = fade + reset

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

// ── Mini-structure layout (a purpose-built stage echoing the canvas visual
// language: hairline edges, mono role tags, red keystone glow + cracks, small
// integrity numeral). Coordinates are in a fixed 700×340 stage. ──────────────
type Role = "thesis" | "claim" | "assumption";
interface Placed {
  id: string;
  role: Role;
  tag: string;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  appear: number; // tick this node fades in (bottom-up stagger)
}

const NODES: Placed[] = [
  // L2 · assumptions (appear first, bottom-up)
  { id: "k_credible", role: "assumption", tag: "KEYSTONE", label: "Credible staged plan by meeting", cx: 142, cy: 258, w: 96, h: 44, appear: 4 },
  { id: "a_obs", role: "assumption", tag: "ASSUMPTION", label: "Enough observability", cx: 246, cy: 258, w: 92, h: 44, appear: 8 },
  { id: "a_audit", role: "assumption", tag: "ASSUMPTION", label: "Auditability over purity", cx: 350, cy: 258, w: 92, h: 44, appear: 12 },
  { id: "a_bound", role: "assumption", tag: "ASSUMPTION", label: "Clean service boundaries", cx: 454, cy: 258, w: 92, h: 44, appear: 16 },
  { id: "a_load", role: "assumption", tag: "ASSUMPTION", label: "Uneven load across features", cx: 558, cy: 258, w: 92, h: 44, appear: 20 },
  // L1 · claims
  { id: "c_exec", role: "claim", tag: "CLAIM", label: "Execute safely near-term", cx: 150, cy: 145, w: 120, h: 46, appear: 26 },
  { id: "c_reliab", role: "claim", tag: "CLAIM", label: "Meets enterprise reliability", cx: 340, cy: 145, w: 120, h: 46, appear: 30 },
  { id: "c_roi", role: "claim", tag: "CLAIM", label: "Migration ROI justifies it", cx: 510, cy: 145, w: 120, h: 46, appear: 34 },
  // L0 · thesis
  { id: "T", role: "thesis", tag: "THESIS", label: "Migrate to microservices", cx: 340, cy: 32, w: 168, h: 48, appear: 40 },
];

const NODE_BY_ID: Record<string, Placed> = Object.fromEntries(NODES.map((n) => [n.id, n]));

// Real dependency edges (parent → child), verbatim from fixtureContextGraph groups.
const EDGES: [string, string][] = [
  ["T", "c_exec"],
  ["T", "c_reliab"],
  ["T", "c_roi"],
  ["c_exec", "k_credible"],
  ["c_reliab", "k_credible"], // the crux: k_credible carries two claims
  ["c_reliab", "a_obs"],
  ["c_reliab", "a_audit"],
  ["c_roi", "a_bound"],
  ["c_roi", "a_load"],
];

const ROLE_ACCENT: Record<Role, string> = { thesis: THESIS, claim: CLAIM, assumption: MUTED };

// Crack polylines drawn across the keystone box when it fails (self-drawing via a
// CSS strokeDashoffset transition). 3 lines, scaled to the 96×44 keystone box.
const CRACKS = [
  "10,0 30,20 20,30 44,44",
  "60,0 72,18 68,44",
  "38,4 50,24 46,44",
];

export function MiniCollapseHero() {
  const [tick, setTick] = useState(0);

  // Engine facts (pure, deterministic, computed once). Numbers are the REAL solver output.
  const model = useMemo(() => {
    const graph: Graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();
    const grounded: Attack[] = reweightAttacksByContext(fixtureContextAttacks(), pack.contextWeightAdjustments);
    const baseline = integrity(graph); // ≈ 61.97
    const loaded = applyAttacks(graph, grounded);
    const loadedInt = integrity(loaded); // ≈ 6.38
    const loadedFailed = detectFailures(loaded); // {T, c_exec, c_reliab, k_credible}
    // De-risk = restore the keystone (drop its attack) → the minimal reinforcement.
    const restored = applyAttacks(graph, grounded.filter((a) => a.targetId !== "k_credible"));
    const restoredInt = integrity(restored); // ≈ 50.62
    const key = keystone(graph); // k_credible
    return { baseline, loadedInt, loadedFailed, restoredInt, keystoneId: key?.id ?? "" };
  }, []);

  // Cleanup-safe master clock. No Date/random — a pure modular counter.
  useEffect(() => {
    const h = setInterval(() => setTick((t) => (t + 1) % TOTAL_TICKS), TICK_MS);
    return () => clearInterval(h);
  }, []);

  // ── Derive the whole frame from `tick` ─────────────────────────────────────
  const collapsing = tick >= LOAD_START && tick < COLLAPSE_END; // load + collapsed hold
  const cracked = tick >= LOAD_START + 6 && tick < COLLAPSE_END;

  let gauge: number;
  if (tick < LOAD_START) gauge = model.baseline;
  else if (tick < LOAD_END) gauge = lerp(model.baseline, model.loadedInt, (tick - LOAD_START) / (LOAD_END - LOAD_START));
  else if (tick < COLLAPSE_END) gauge = model.loadedInt;
  else if (tick < DERISK_END) gauge = lerp(model.loadedInt, model.restoredInt, (tick - COLLAPSE_END) / (DERISK_END - COLLAPSE_END));
  else gauge = model.restoredInt;

  const gaugeInt = Math.round(gauge);
  const status = gaugeInt >= 35 ? "HOLDING" : gaugeInt >= 10 ? "STRESSED" : "FAILED";
  const statusColor = gaugeInt >= 35 ? OK : gaugeInt >= 10 ? WARN : BAD;

  const phase =
    tick < 42 ? "ASSEMBLING STRUCTURE"
    : tick < LOAD_START ? "STRUCTURE STANDING"
    : tick < LOAD_END ? "APPLYING LOAD"
    : tick < COLLAPSE_END ? "KEYSTONE FAILED"
    : tick < DERISK_END ? "DE-RISKING · RESTORE KEYSTONE"
    : tick < HEAL_END ? "STRUCTURE RESTORED"
    : "RESET";

  // Overall fade during the reset window, so the loop restarts cleanly.
  const stageOpacity = tick >= HEAL_END ? 1 - (tick - HEAL_END) / (TOTAL_TICKS - HEAL_END) : 1;

  const isFailed = (id: string) => collapsing && model.loadedFailed.has(id);

  return (
    <div
      data-testid="mini-collapse-hero"
      style={{
        border: `1px solid ${HAIR_STRONG}`,
        background: PANEL,
        width: "100%",
        overflow: "hidden",
      }}
    >
      {/* Readout strip — integrity numeral, status word, phase. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          borderBottom: `1px solid ${HAIR}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="label">Integrity</span>
          <span className="mono" style={{ fontSize: 30, lineHeight: 1, color: statusColor, fontWeight: 600 }}>
            {gaugeInt}%
          </span>
        </div>
        <span className="chip" style={{ color: statusColor, borderColor: statusColor }}>
          {status}
        </span>
        <div style={{ flex: 1 }} />
        <span className="label" style={{ letterSpacing: "0.14em", color: MUTED }}>
          {phase}
        </span>
      </div>

      {/* Thin integrity bar. */}
      <div style={{ height: 3, background: HAIR, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${clamp(gauge, 0, 100)}%`,
            background: statusColor,
            transition: `width ${TICK_MS}ms linear`,
          }}
        />
      </div>

      {/* Stage — fixed 700×340 coordinate space, centered. */}
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 16px" }}>
        <div
          style={{
            position: "relative",
            width: 700,
            height: 340,
            maxWidth: "100%",
            opacity: stageOpacity,
            transition: `opacity ${TICK_MS}ms linear`,
          }}
        >
          {/* Hairline dependency edges (behind the nodes). */}
          <svg
            width={700}
            height={340}
            viewBox="0 0 700 340"
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden
          >
            {EDGES.map(([p, c]) => {
              const pn = NODE_BY_ID[p];
              const cn = NODE_BY_ID[c];
              const shown = tick >= pn.appear; // both endpoints present once the parent lands
              const failedEdge = isFailed(p) && isFailed(c);
              return (
                <line
                  key={`${p}-${c}`}
                  x1={pn.cx}
                  y1={pn.cy + pn.h / 2}
                  x2={cn.cx}
                  y2={cn.cy - cn.h / 2}
                  stroke={failedEdge ? BAD : HAIR_STRONG}
                  strokeWidth={failedEdge ? 1.4 : 1}
                  style={{
                    opacity: shown ? (failedEdge ? 0.85 : 0.55) : 0,
                    transition: "opacity 0.4s ease, stroke 0.3s ease",
                  }}
                />
              );
            })}
          </svg>

          {/* Nodes. */}
          {NODES.map((n) => {
            const shown = tick >= n.appear;
            const failed = isFailed(n.id);
            const isKey = n.id === model.keystoneId;
            const accent = failed ? BAD : isKey ? KEYSTONE : ROLE_ACCENT[n.role];
            const glow = isKey
              ? cracked
                ? "0 0 26px 4px rgba(178,58,46,0.85)"
                : "inset 0 0 0 1px rgba(178,58,46,0.35), 0 0 12px 0 rgba(178,58,46,0.4)"
              : "0 6px 12px rgba(26,26,21,0.10)";
            return (
              <div
                key={n.id}
                data-node={n.id}
                style={{
                  position: "absolute",
                  left: n.cx - n.w / 2,
                  top: n.cy - n.h / 2,
                  width: n.w,
                  height: n.h,
                  border: `1px solid ${accent}`,
                  borderLeft: `3px solid ${accent}`,
                  background: failed ? "#f6ecea" : PANEL,
                  boxShadow: glow,
                  padding: "5px 7px",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  opacity: shown ? (failed ? 0.55 : 1) : 0,
                  transform: shown ? "translateY(0)" : "translateY(12px)",
                  transition: "opacity 0.45s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1), border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--sans)",
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: accent,
                  }}
                >
                  {failed ? "FAILED" : n.tag}
                </span>
                <div style={{ fontFamily: "var(--sans)", fontSize: n.role === "thesis" ? 12 : 10, lineHeight: 1.2, marginTop: 2, color: INK }}>
                  {n.label}
                </div>

                {/* Keystone cracks — self-draw when the keystone fails. */}
                {isKey && (
                  <svg
                    width={n.w}
                    height={n.h}
                    viewBox={`0 0 ${n.w} ${n.h}`}
                    style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
                    aria-hidden
                  >
                    {CRACKS.map((pts, i) => (
                      <polyline
                        key={i}
                        points={pts}
                        fill="none"
                        stroke={i === 1 ? BAD : KEYSTONE}
                        strokeWidth={1.6 - i * 0.3}
                        strokeDasharray={200}
                        style={{
                          strokeDashoffset: cracked ? 0 : 200,
                          opacity: cracked ? 0.9 : 0,
                          transition: `stroke-dashoffset 0.35s ease ${i * 0.08}s, opacity 0.25s ease`,
                        }}
                      />
                    ))}
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
