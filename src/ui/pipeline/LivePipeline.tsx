"use client";
// LIVE PIPELINE — a dismissable, full-screen overlay that mounts WHILE a real run is in
// progress (Analyse / Apply Load) and reflects the ACTUAL run: the agents that gathered, the
// context that compiled, the structure that extracted, the attacks that generated, and — the
// headline — the deterministic SOLVER computing on the REAL graph in the store.
//
// It is the cinematic "system at work" language of the landing (SystemAtWork.tsx), but bound to
// truth instead of a scripted fixture: every stage lights from the caller's real `stage` +
// `stageSource`, and every number in the MATH beat is the pure engine's output on the store's
// workingGraph — supportBreakdown (own×dependency=support), integrity(), and rankLoadBearing()/
// explainKeystone() (the keystone ranking). The LLM proposed the shape; CODE computes the verdict.
//
// PURE-RENDER + DETERMINISTIC: a single `tick` counter (setInterval, cleanup-safe) drives every
// frame — no Math.random, no Date.now, no new Date(). Elapsed timing is tick × TICK_MS (elapsed-
// since-mount, NOT wall-clock). SSR/jsdom-safe: tick 0 renders cleanly. KEY-SAFE: imports only
// @/engine, @/store, @/ui, @/canvas — never @/agents / @/context barrels, never the SDK. Findings
// arrive as plain {label,value,source} snapshots from the caller (no @/agents import here).
import { useEffect, useMemo, useRef, useState } from "react";
import type { Graph } from "@/engine";
import { integrity, rankLoadBearing, supportBreakdown } from "@/engine";
import {
  selectFailures,
  selectIntegrity,
  selectKeystoneId,
  useKeystone,
} from "@/store/useKeystone";
import { STRATUM_LEVEL } from "@/canvas/depth";
import { IntegrityGauge } from "@/ui/IntegrityGauge";
import { MiniStructure, layoutStructure } from "@/ui/MiniStructure";
import { usePrefersReducedMotion } from "@/ui/useReducedMotion";
import {
  BAD,
  CLAIM,
  HAIR,
  HAIR_STRONG,
  INK,
  INK_2,
  KEYSTONE,
  MUTED,
  OK,
  PANEL,
  PANEL_2,
  THESIS,
} from "@/ui/tokens";

// ── Timeline ────────────────────────────────────────────────────────────────
// One tick = 80ms. A stage never shows ✓ before BOTH its real data exists AND its cumulative
// min-dwell tick has passed — so an instant offline/fixture run still plays a ~2.5s beat, while a
// live ~50s run reflects real durations (real gates come in after the tiny dwell floor).
const TICK_MS = 80;
const MIN: Record<StageKey, number> = {
  gather: 6, // 0.48s
  compile: 13, // 1.04s
  extract: 20, // 1.60s
  attacks: 26, // 2.08s
  solve: 32, // 2.56s
};
// The overlay will not auto-dismiss (on real `stage==="done"`) before this floor — the guaranteed
// minimum cinematic beat so judges always see the pipeline, even on a near-instant fixture run.
const MIN_TOTAL_TICKS = 34; // 2.72s
const FADE_MS = 320;

type StageKey = "gather" | "compile" | "extract" | "attacks" | "solve";
type StageStatus = "queued" | "active" | "done";
type Source = "live" | "fixture" | null;

interface StageDef {
  key: StageKey;
  n: string;
  name: string;
  explain: string;
}
const STAGES: StageDef[] = [
  {
    key: "gather",
    n: "1",
    name: "GATHER",
    explain:
      "GATHER — agents clone the repo, crawl the site + competitors, and parse the agenda into source-attributed findings.",
  },
  {
    key: "compile",
    n: "2",
    name: "COMPILE CONTEXT",
    explain:
      "COMPILE CONTEXT — one model call fuses every finding into a decision context pack + per-category weight adjustments.",
  },
  {
    key: "extract",
    n: "3",
    name: "EXTRACT STRUCTURE",
    explain:
      "EXTRACT STRUCTURE — the decision becomes a load path: thesis → claims → assumptions, each grounded in evidence.",
  },
  {
    key: "attacks",
    n: "4",
    name: "GENERATE ATTACKS",
    explain:
      "GENERATE ATTACKS — context-weighted failure modes are proposed against the load-bearing assumptions.",
  },
  {
    key: "solve",
    n: "5",
    name: "SOLVE",
    explain:
      "SOLVE — the deterministic solver computes support, integrity, and the keystone. The LLM cannot override it.",
  },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const secs = (t: number) => `${((t * TICK_MS) / 1000).toFixed(1)}s`;

export interface LivePipelineProps {
  /** Real per-run stage from the orchestrator (analyse / applyLoad). */
  stage: "idle" | "context" | "extract" | "attacks" | "done";
  /** Real, truthful per-stage provenance for THIS run. */
  stageSource: { context: Source; extract: Source; attacks: Source };
  /** building || loading — a run is actually in flight. */
  running: boolean;
  /** Snapshot of gather findings lifted from finished agent runs (plain data — no @/agents). */
  gatherFacts: { label: string; value: string; source: string }[];
  /** Hide the overlay. NEVER cancels the run — the run lives in the parent and continues. */
  onDismiss: () => void;
}

export function LivePipeline({
  stage,
  stageSource,
  running,
  gatherFacts,
  onDismiss,
}: LivePipelineProps) {
  const [tick, setTick] = useState(0);
  const [fading, setFading] = useState(false);
  const [hovered, setHovered] = useState<StageKey | null>(null);
  // A-3: the master clock keeps running (it also paces real-data polling elsewhere), but under
  // prefers-reduced-motion we stop treating it as an artificial minimum dwell/cinematic floor —
  // a stage resolves the instant its REAL data is ready, and the stage-beat pulse/particles (pure
  // decoration) are suppressed. CSS transitions for the rest are killed globally in theme.css.
  const reducedMotion = usePrefersReducedMotion();

  // Cleanup-safe master clock. Elapsed = tick × TICK_MS (since mount) — never a wall-clock read.
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(h);
  }, []);

  // ── REAL state, straight from the store (the MATH runs on THIS graph). ──
  const workingGraph = useKeystone((s) => s.workingGraph) as Graph | null;
  const decisionContextPack = useKeystone((s) => s.decisionContextPack);
  const loadApplied = useKeystone((s) => s.loadApplied);
  const failures = useKeystone(selectFailures);
  const integrityValue = useKeystone(selectIntegrity);
  const keystoneId = useKeystone(selectKeystoneId);

  // ── Real per-stage completion signals ──
  const packReady = !!decisionContextPack;
  const graphReady = !!workingGraph;
  const attacksReady = loadApplied || stageSource.attacks != null;
  const runDone = stage === "done";
  const gatherRan = gatherFacts.length > 0;

  const realDone: Record<StageKey, boolean> = {
    gather: true, // gather precedes the run; it either produced findings or was skipped
    compile: packReady,
    extract: graphReady,
    attacks: attacksReady,
    solve: graphReady && runDone,
  };
  // A stage is SKIPPED when this run legitimately never executes it (e.g. Analyse never
  // generates attacks; a run with no agents never gathered) — shown as a resolved dash, not a stall.
  const skipped: Record<StageKey, boolean> = {
    gather: !gatherRan,
    compile: false,
    extract: false,
    attacks: runDone && !attacksReady,
    solve: false,
  };
  // Which stage is really being fetched right now (drives the ● RUNNING pulse).
  const realActive: Record<StageKey, boolean> = {
    gather: false,
    compile: stage === "context",
    extract: stage === "extract",
    attacks: stage === "attacks",
    solve: graphReady && !runDone,
  };

  // ── Derive a visual status per stage: real-gated, min-dwell floored, ordered. ──
  const rows = useMemo(() => {
    let sawActive = false;
    const out = STAGES.map((s) => {
      const dwellPassed = reducedMotion || tick >= MIN[s.key];
      const resolved = realDone[s.key] || skipped[s.key];
      let status: StageStatus;
      if (dwellPassed && resolved) status = "done";
      else if (realActive[s.key]) {
        status = "active";
        sawActive = true;
      } else status = "queued";
      return { ...s, status, skipped: skipped[s.key] };
    });
    // If nothing is really fetching yet (a fast fixture run mid-dwell), keep the beat alive by
    // marking the first not-yet-done stage active — the sequential "system at work" reveal.
    if (!sawActive) {
      const idx = out.findIndex((r) => r.status !== "done");
      if (idx >= 0) out[idx].status = "active";
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, packReady, graphReady, attacksReady, runDone, gatherRan, stage, reducedMotion]);

  // ── Record real elapsed-at-completion per stage (effect, not render — deterministic). ──
  const doneAt = useRef<Partial<Record<StageKey, number>>>({});
  useEffect(() => {
    for (const r of rows) {
      if (r.status === "done" && doneAt.current[r.key] === undefined) {
        doneAt.current[r.key] = tick;
      }
    }
  }, [rows, tick]);

  // ── Dismiss (one-shot). Fades, then hands back after the fade. NEVER cancels the run — the
  // fetch chain lives in the parent. A ref guard ensures we schedule the hand-off exactly once
  // (so re-renders / the `fading` flip can't cancel the pending fade timeout). ──
  const dismissedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  function dismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setFading(true);
    // A-3: the fade transition itself is killed via theme.css under reduced motion, so don't
    // also sit on a dark, static overlay for FADE_MS with nothing visibly happening — hand off
    // immediately.
    setTimeout(() => onDismissRef.current(), reducedMotion ? 0 : FADE_MS);
  }

  // Auto-dismiss on real completion, but never before the min cinematic beat (A-3: skip that
  // floor under reduced motion — dismiss the moment the real run is done).
  const readyToDismiss = runDone && (reducedMotion || tick >= MIN_TOTAL_TICKS);
  useEffect(() => {
    if (readyToDismiss) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToDismiss]);

  // ── THE MATH — the real engine output on the store's workingGraph (recomputed on graph change). ──
  const math = useMemo(() => {
    if (!workingGraph) return null;
    const breakdown = supportBreakdown(workingGraph);
    const ranked = rankLoadBearing(workingGraph);
    const maxImpact = ranked.reduce((m, r) => Math.max(m, r.impact), 0);
    // Support rows, bottom-up: assumptions (L2) → claims (L1) → thesis (L0), the order the solver
    // fills them in (leaves first). STRATUM_LEVEL gives the depth; higher level = deeper = earlier.
    const supportRows = [...breakdown.nodes].sort(
      (a, b) => STRATUM_LEVEL[b.type] - STRATUM_LEVEL[a.type],
    );
    const laid = layoutStructure(workingGraph, {
      width: 300,
      height: 188,
      keystoneId: keystoneId ?? undefined,
    });
    return {
      breakdown,
      ranked,
      maxImpact,
      supportRows,
      integrity: integrity(workingGraph),
      laid,
    };
  }, [workingGraph, keystoneId]);

  // SOLVE reveal — deterministic on tick, starts once the structure exists (after EXTRACT dwell).
  // A-3: reduced motion jumps both straight to their end value (support rows all filled, every
  // MiniStructure node past its `appear` tick) instead of ramping/staggering in.
  const solveProgress = reducedMotion ? 1 : clamp((tick - MIN.extract) / 16, 0, 1);
  const genTick = reducedMotion ? Number.MAX_SAFE_INTEGER : Math.max(0, tick - MIN.extract);
  const keystoneFailed = keystoneId != null && failures.has(keystoneId);

  const dim = (k: StageKey) => (hovered && hovered !== k ? 0.34 : 1);
  const tooltip = hovered ? STAGES.find((s) => s.key === hovered)?.explain ?? "" : "";

  // A deterministic blink for the ● RUNNING pulse (no timers of its own) — held steady (no
  // flicker) under reduced motion (A-3).
  const pulse = reducedMotion ? true : tick % 4 < 2;

  return (
    <div
      data-testid="live-pipeline"
      onMouseLeave={() => setHovered(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(20,20,15,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 20px",
        overflow: "auto",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms linear`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1080,
          background: PANEL,
          border: `1px solid ${HAIR_STRONG}`,
        }}
      >
        {/* ── Header — stage strip + LIVE beat + SKIP ─────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "8px 12px",
            borderBottom: `1px solid ${HAIR_STRONG}`,
            background: PANEL_2,
          }}
        >
          <span className="label" style={{ letterSpacing: "0.14em", color: INK }}>
            ▣ LIVE PIPELINE
          </span>
          {STAGES.map((s) => {
            const st = rows.find((r) => r.key === s.key)!.status;
            return (
              <span
                key={s.key}
                className="label"
                style={{
                  letterSpacing: "0.1em",
                  color: st === "queued" ? MUTED : INK,
                  borderBottom:
                    st === "active"
                      ? `2px solid ${KEYSTONE}`
                      : st === "done"
                        ? `2px solid ${OK}`
                        : "2px solid transparent",
                  paddingBottom: 2,
                }}
              >
                {s.name}
              </span>
            );
          })}
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: MUTED }}>
            {running ? "▶ RUNNING" : "■ SETTLING"} · {secs(tick)}
          </span>
          <button
            type="button"
            className="btn"
            data-testid="live-pipeline-skip"
            onClick={dismiss}
            title="Dismiss the overlay — the run continues in the background"
          >
            ✕ SKIP
          </button>
        </div>

        {/* Tooltip line (hover a stage to inspect) — reserved height so nothing jumps. */}
        <div
          style={{
            minHeight: 24,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            borderBottom: `1px solid ${HAIR}`,
            background: PANEL,
            fontSize: 11,
            color: tooltip ? INK_2 : MUTED,
          }}
        >
          <span className="mono">
            {tooltip ||
              "The whole system, bound to this run: gather → compile → extract → generate → solve. Dismissing keeps the run alive."}
          </span>
        </div>

        {/* ── Stage cards ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
            padding: 12,
          }}
        >
          {rows.map((r, i) => {
            const src: Source =
              r.key === "compile"
                ? stageSource.context
                : r.key === "extract"
                  ? stageSource.extract
                  : r.key === "attacks"
                    ? stageSource.attacks
                    : null;
            const stamp = doneAt.current[r.key];
            const factCount =
              r.key === "gather" ? gatherFacts.length : undefined;
            return (
              <StageCard
                key={r.key}
                n={r.n}
                name={r.name}
                status={r.status}
                skipped={r.skipped}
                source={src}
                gatherCount={factCount}
                elapsed={r.status === "done" && stamp != null ? secs(stamp) : r.status === "active" ? secs(tick) : null}
                pulse={pulse}
                opacity={dim(r.key)}
                onHover={() => setHovered(r.key)}
                flowInto={i < rows.length - 1}
                flowActive={r.status !== "queued" && rows[i + 1]?.status === "active"}
                tick={tick}
                reducedMotion={reducedMotion}
              />
            );
          })}
        </div>

        {/* ── THE MATH — the SOLVE beat, computed on the REAL graph ────────── */}
        <div
          onMouseEnter={() => setHovered("solve")}
          style={{
            borderTop: `1px solid ${HAIR_STRONG}`,
            background: PANEL,
            padding: 12,
            opacity: dim("solve"),
            transition: "opacity 0.25s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 14, color: graphReady ? KEYSTONE : MUTED }}>
              5
            </span>
            <span className="label" style={{ letterSpacing: "0.14em", color: graphReady ? INK : MUTED }}>
              SOLVE · THE MATH
            </span>
            {graphReady && (
              <span className="label" style={{ color: OK, letterSpacing: "0.1em" }}>
                ● DETERMINISTIC
              </span>
            )}
          </div>

          {!math ? (
            <div
              className="mono"
              style={{ fontSize: 11, color: MUTED, padding: "24px 0", textAlign: "center" }}
            >
              awaiting structure · the solver runs the moment the graph lands…
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 1.1fr) minmax(280px, 1fr)",
                gap: 12,
                alignItems: "start",
              }}
            >
              {/* LEFT — the structure assembling bottom-up (reuses the shared renderer). */}
              <MiniStructure
                nodes={math.laid.nodes}
                edges={math.laid.edges}
                width={math.laid.width}
                height={math.laid.height}
                keystoneId={keystoneId ?? ""}
                tick={genTick}
                failedIds={failures}
                cracked={keystoneFailed}
                tickMs={TICK_MS}
                testId="live-pipeline-structure"
              />

              {/* RIGHT — the numbers: integrity (counting), support decomposition, sensitivity. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* INTEGRITY — real engine value, counting up (reuses IntegrityGauge). */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    border: `1px solid ${HAIR}`,
                    background: PANEL_2,
                    padding: "8px 12px",
                  }}
                >
                  <IntegrityGauge value={integrityValue} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span className="label" style={{ letterSpacing: "0.12em", color: MUTED }}>
                      THESIS SUPPORT
                    </span>
                    <span className="mono" data-testid="live-pipeline-integrity" style={{ fontSize: 13, color: INK }}>
                      {math.integrity.toFixed(1)}% integrity
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: MUTED }}>
                      keystone · {keystoneId ?? "—"}
                    </span>
                  </div>
                </div>

                {/* SUPPORT DECOMPOSITION — own × dependency = support, filling bottom-up. */}
                <div style={{ border: `1px solid ${HAIR}`, background: PANEL }}>
                  <div
                    className="label"
                    style={{
                      letterSpacing: "0.1em",
                      color: MUTED,
                      padding: "5px 10px",
                      borderBottom: `1px solid ${HAIR}`,
                    }}
                  >
                    SUPPORT = OWN × DEPENDENCY
                  </div>
                  {math.supportRows.map((node, idx) => {
                    const on = idx < Math.ceil(solveProgress * math.supportRows.length);
                    const isKey = node.id === keystoneId;
                    return (
                      <div
                        key={node.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 8,
                          padding: "3px 10px",
                          borderBottom:
                            idx < math.supportRows.length - 1 ? `1px solid ${HAIR}` : "none",
                          opacity: on ? 1 : 0.15,
                          transition: "opacity 0.35s ease",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--sans)",
                            fontSize: 10,
                            color: node.failed ? BAD : isKey ? KEYSTONE : roleColor(node.type),
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isKey ? "◆ " : ""}
                          {node.label}
                        </span>
                        <span
                          className="mono"
                          style={{ fontSize: 10.5, color: node.failed ? BAD : INK, whiteSpace: "nowrap" }}
                        >
                          {node.ownConfidence.toFixed(2)} × {node.dependencyFactor.toFixed(2)} ={" "}
                          <strong>{node.support.toFixed(2)}</strong>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* SENSITIVITY — knockout impact per assumption; the keystone lights up. */}
                <div style={{ border: `1px solid ${HAIR}`, background: PANEL }}>
                  <div
                    className="label"
                    style={{
                      letterSpacing: "0.1em",
                      color: MUTED,
                      padding: "5px 10px",
                      borderBottom: `1px solid ${HAIR}`,
                    }}
                  >
                    SENSITIVITY · KNOCKOUT IMPACT
                  </div>
                  <div style={{ padding: "6px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                    {math.ranked.slice(0, 5).map((r, idx) => {
                      const isKey = r.id === keystoneId;
                      const on = solveProgress > 0.25 + idx * 0.12;
                      const w = math.maxImpact > 0 ? (r.impact / math.maxImpact) * 100 : 0;
                      return (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 9.5,
                              color: isKey ? KEYSTONE : MUTED,
                              width: 92,
                              flexShrink: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isKey ? "◆ " : ""}
                            {r.id}
                          </span>
                          <div style={{ flex: 1, height: 8, background: PANEL_2, position: "relative" }}>
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: on ? `${w}%` : "0%",
                                background: isKey ? KEYSTONE : HAIR_STRONG,
                                transition: `width ${TICK_MS * 3}ms ease`,
                              }}
                            />
                          </div>
                          <span className="mono" style={{ fontSize: 9.5, color: isKey ? KEYSTONE : MUTED, width: 40, textAlign: "right" }}>
                            {r.impact.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Caption — the thesis of the whole tool. */}
          <div
            className="label"
            style={{
              letterSpacing: "0.12em",
              color: MUTED,
              marginTop: 12,
              paddingTop: 8,
              borderTop: `1px solid ${HAIR}`,
            }}
          >
            DETERMINISTIC SOLVER · LLM PROPOSED THE SHAPE · CODE COMPUTES THE VERDICT
          </div>
        </div>
      </div>
    </div>
  );
}

function roleColor(type: "thesis" | "claim" | "assumption"): string {
  return type === "thesis" ? THESIS : type === "claim" ? CLAIM : MUTED;
}

// ── Stage card ────────────────────────────────────────────────────────────────
function StageCard({
  n,
  name,
  status,
  skipped,
  source,
  gatherCount,
  elapsed,
  pulse,
  opacity,
  onHover,
  flowInto,
  flowActive,
  tick,
  reducedMotion,
}: {
  n: string;
  name: string;
  status: StageStatus;
  skipped: boolean;
  source: Source;
  gatherCount?: number;
  elapsed: string | null;
  pulse: boolean;
  opacity: number;
  onHover: () => void;
  flowInto: boolean;
  flowActive: boolean;
  tick: number;
  reducedMotion: boolean;
}) {
  const accent = status === "done" ? OK : status === "active" ? KEYSTONE : HAIR_STRONG;
  const inkColor = status === "queued" ? MUTED : INK;
  return (
    <div
      onMouseEnter={onHover}
      style={{
        position: "relative",
        border: `1px solid ${status === "active" ? KEYSTONE : HAIR}`,
        borderLeft: `3px solid ${accent}`,
        background: PANEL,
        padding: 8,
        cursor: "help",
        opacity,
        transition: "opacity 0.25s ease, border-color 0.25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="mono" style={{ fontSize: 12, color: accent }}>
          {n}
        </span>
        <span className="label" style={{ letterSpacing: "0.08em", color: inkColor, fontSize: 10 }}>
          {name}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, minHeight: 16 }}>
        {status === "done" && !skipped && (
          <span className="mono" style={{ fontSize: 11, color: OK }}>
            ✓
          </span>
        )}
        {status === "done" && skipped && (
          <span className="label" style={{ fontSize: 9, color: MUTED }}>
            SKIPPED
          </span>
        )}
        {status === "active" && (
          <>
            <span
              aria-hidden
              style={{ width: 6, height: 6, background: KEYSTONE, opacity: pulse ? 1 : 0.25, transition: "opacity 0.12s linear" }}
            />
            <span className="label" style={{ fontSize: 9, color: KEYSTONE }}>
              RUNNING
            </span>
          </>
        )}
        {status === "queued" && (
          <span className="label" style={{ fontSize: 9, color: MUTED }}>
            QUEUED
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* LIVE / CACHED chip from the real per-stage source. */}
        {status === "done" && !skipped && source && (
          <span
            className="mono"
            data-testid="live-pipeline-source"
            style={{
              fontSize: 8.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              padding: "1px 5px",
              border: `1px solid ${source === "live" ? OK : MUTED}`,
              color: source === "live" ? OK : MUTED,
            }}
          >
            {source === "live" ? "LIVE" : "CACHED"}
          </span>
        )}
      </div>

      {/* Elapsed + gather count. */}
      <div className="mono" style={{ fontSize: 9, color: MUTED, marginTop: 4, minHeight: 12 }}>
        {gatherCount != null && gatherCount > 0 ? `${gatherCount} findings · ` : ""}
        {elapsed ?? ""}
      </div>

      {/* Hairline flow wire into the next stage — particles travel while data is moving. */}
      {flowInto && (
        <svg
          width={16}
          height={10}
          viewBox="0 0 16 10"
          aria-hidden
          style={{
            position: "absolute",
            right: -12,
            top: "50%",
            transform: "translateY(-50%)",
            overflow: "visible",
            zIndex: 1,
          }}
        >
          <line x1={0} y1={5} x2={16} y2={5} stroke={HAIR_STRONG} strokeWidth={0.8} />
          {/* A-3: the traveling dots are pure decoration (provenance already reads from the
              LIVE/CACHED chip + ✓/RUNNING/QUEUED state) — suppressed under reduced motion. */}
          {flowActive &&
            !reducedMotion &&
            [0, 0.5].map((off) => {
              const t = ((tick / 8 + off) % 1);
              return <circle key={off} cx={t * 16} cy={5} r={1.6} fill={CLAIM} />;
            })}
        </svg>
      )}
    </div>
  );
}
