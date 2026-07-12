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
import { Eyebrow, Pill } from "@/ui/primitives";
import type { PillTone } from "@/ui/primitives";

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
        // Cool, theme-neutral scrim + a soft blur so the overlay reads as a modern sheet
        // floating over the studio (in both light and dark) — not a warm terminal wash.
        background: "rgba(13,14,18,0.45)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "28px 20px",
        overflow: "auto",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms linear`,
      }}
    >
      <div
        className="panel"
        style={{
          width: "100%",
          maxWidth: 1080,
          overflow: "hidden",
        }}
      >
        {/* ── Header — title + live beat + elapsed + SKIP ─────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "14px 18px",
            borderBottom: "1px solid var(--hair)",
            background: "var(--panel)",
          }}
        >
          {/* The keystone heartbeat — pulses via `.live-dot` (reduced-motion aware in theme.css). */}
          <span className="live-dot" aria-hidden />
          <Eyebrow style={{ letterSpacing: "0.14em", color: "var(--ink)" }}>Live Pipeline</Eyebrow>
          <div style={{ flex: 1 }} />
          <Pill tone={running ? "accent" : "neutral"} dot={false}>
            {running ? "Running" : "Settling"}
          </Pill>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {secs(tick)}
          </span>
          <button
            type="button"
            className="btn"
            data-testid="live-pipeline-skip"
            onClick={dismiss}
            title="Dismiss the overlay — the run continues in the background"
          >
            Dismiss — runs in background
          </button>
        </div>

        {/* Tooltip line (hover a stage to inspect) — reserved height so nothing jumps. */}
        <div
          style={{
            minHeight: 26,
            display: "flex",
            alignItems: "center",
            padding: "6px 18px",
            borderBottom: "1px solid var(--hair)",
            background: "var(--panel-2)",
            fontSize: 12,
            lineHeight: 1.4,
            color: tooltip ? "var(--ink-2)" : "var(--muted)",
          }}
        >
          <span style={{ fontFamily: "var(--sans)" }}>
            {tooltip ||
              "The whole system, bound to this run: gather → compile → extract → generate → solve. Dismissing keeps the run alive."}
          </span>
        </div>

        {/* ── Stage cards ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 10,
            padding: 16,
          }}
        >
          {rows.map((r) => {
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
              />
            );
          })}
        </div>

        {/* ── THE MATH — the SOLVE beat, computed on the REAL graph ────────── */}
        <div
          onMouseEnter={() => setHovered("solve")}
          style={{
            borderTop: "1px solid var(--hair)",
            background: "var(--panel-2)",
            padding: 16,
            opacity: dim("solve"),
            transition: "opacity 0.25s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span
              className="mono"
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 999,
                fontSize: 12,
                color: graphReady ? "#fff" : "var(--muted)",
                background: graphReady ? "var(--keystone)" : "var(--panel)",
                border: `1px solid ${graphReady ? "var(--keystone)" : "var(--hair-strong)"}`,
              }}
            >
              5
            </span>
            <Eyebrow style={{ letterSpacing: "0.14em", color: graphReady ? "var(--ink)" : "var(--muted)" }}>
              Solve · The Math
            </Eyebrow>
            {graphReady && <Pill tone="hold">Deterministic</Pill>}
          </div>

          {!math ? (
            <div
              style={{
                fontFamily: "var(--sans)",
                fontSize: 12,
                color: "var(--muted)",
                padding: "28px 0",
                textAlign: "center",
              }}
            >
              Awaiting structure · the solver runs the moment the graph lands…
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 1.1fr) minmax(280px, 1fr)",
                gap: 14,
                alignItems: "start",
              }}
            >
              {/* LEFT — the structure assembling bottom-up (reuses the shared renderer). */}
              <div
                style={{
                  border: "1px solid var(--hair)",
                  borderRadius: "var(--radius)",
                  background: "var(--panel)",
                  padding: 10,
                }}
              >
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
              </div>

              {/* RIGHT — the numbers: integrity (counting), support decomposition, sensitivity. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* INTEGRITY — real engine value, counting up (reuses IntegrityGauge). */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    border: "1px solid var(--hair)",
                    borderRadius: "var(--radius)",
                    background: "var(--panel)",
                    padding: "12px 14px",
                  }}
                >
                  <IntegrityGauge value={integrityValue} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Eyebrow>Thesis support</Eyebrow>
                    <span
                      className="mono"
                      data-testid="live-pipeline-integrity"
                      style={{ fontSize: 14, color: "var(--ink)" }}
                    >
                      {math.integrity.toFixed(1)}% integrity
                    </span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                      keystone · {keystoneId ?? "—"}
                    </span>
                  </div>
                </div>

                {/* SUPPORT DECOMPOSITION — own × dependency = support, filling bottom-up. */}
                <div
                  style={{
                    border: "1px solid var(--hair)",
                    borderRadius: "var(--radius)",
                    background: "var(--panel)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="label"
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--hair)",
                    }}
                  >
                    Support = own × dependency
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
                          padding: "5px 12px",
                          borderBottom:
                            idx < math.supportRows.length - 1 ? "1px solid var(--hair)" : "none",
                          opacity: on ? 1 : 0.2,
                          transition: "opacity 0.35s ease",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--sans)",
                            fontSize: 11.5,
                            color: node.failed
                              ? "var(--bad)"
                              : isKey
                                ? "var(--keystone)"
                                : roleColor(node.type),
                            fontWeight: isKey ? 600 : 400,
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
                          style={{
                            fontSize: 11,
                            color: node.failed ? "var(--bad)" : "var(--ink-2)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {node.ownConfidence.toFixed(2)} × {node.dependencyFactor.toFixed(2)} ={" "}
                          <strong style={{ color: node.failed ? "var(--bad)" : "var(--ink)" }}>
                            {node.support.toFixed(2)}
                          </strong>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* SENSITIVITY — knockout impact per assumption; the keystone lights up. */}
                <div
                  style={{
                    border: "1px solid var(--hair)",
                    borderRadius: "var(--radius)",
                    background: "var(--panel)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="label"
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--hair)",
                    }}
                  >
                    Sensitivity · knockout impact
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                    {math.ranked.slice(0, 5).map((r, idx) => {
                      const isKey = r.id === keystoneId;
                      const on = solveProgress > 0.25 + idx * 0.12;
                      const w = math.maxImpact > 0 ? (r.impact / math.maxImpact) * 100 : 0;
                      return (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 10,
                              color: isKey ? "var(--keystone)" : "var(--muted)",
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
                          <div
                            style={{
                              flex: 1,
                              height: 8,
                              borderRadius: 999,
                              background: "var(--panel-2)",
                              position: "relative",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: on ? `${w}%` : "0%",
                                borderRadius: 999,
                                background: isKey ? "var(--keystone)" : "var(--hair-strong)",
                                transition: `width ${TICK_MS * 3}ms ease`,
                              }}
                            />
                          </div>
                          <span
                            className="mono"
                            style={{
                              fontSize: 10,
                              color: isKey ? "var(--keystone)" : "var(--muted)",
                              width: 40,
                              textAlign: "right",
                            }}
                          >
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
              color: "var(--muted)",
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid var(--hair)",
            }}
          >
            Deterministic solver · LLM proposed the shape · code computes the verdict
          </div>
        </div>
      </div>
    </div>
  );
}

function roleColor(type: "thesis" | "claim" | "assumption"): string {
  return type === "thesis"
    ? "var(--thesis)"
    : type === "claim"
      ? "var(--claim)"
      : "var(--ink-2)";
}

// ── Stage card ────────────────────────────────────────────────────────────────
// A soft inset card (rounded, hair border, panel ground) — a status Pill carries the
// RUNNING/DONE/QUEUED/SKIPPED state, a compact chip the LIVE/CACHED provenance.
const STAGE_PILL: Record<StageStatus, { tone: PillTone; label: string }> = {
  active: { tone: "accent", label: "Running" },
  done: { tone: "hold", label: "Done" },
  queued: { tone: "neutral", label: "Queued" },
};
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
}) {
  const active = status === "active";
  const numColor =
    status === "done" ? "var(--ok)" : active ? "var(--accent)" : "var(--muted)";
  const inkColor = status === "queued" ? "var(--muted)" : "var(--ink)";
  const pill =
    status === "done" && skipped ? { tone: "neutral" as PillTone, label: "Skipped" } : STAGE_PILL[status];
  return (
    <div
      onMouseEnter={onHover}
      style={{
        position: "relative",
        border: `1px solid ${active ? "var(--accent)" : "var(--hair)"}`,
        borderRadius: "var(--radius)",
        background: "var(--panel)",
        boxShadow: active ? "var(--shadow-sm)" : "none",
        padding: 12,
        cursor: "help",
        opacity,
        transition: "opacity 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span className="mono" style={{ fontSize: 12, color: numColor }}>
          {n}
        </span>
        <span className="label" style={{ color: inkColor, fontSize: 10.5 }}>
          {name}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, minHeight: 24 }}>
        {active ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontFamily: "var(--sans)",
              fontSize: 12,
              fontWeight: 600,
              padding: "5px 11px",
              borderRadius: 999,
              background: "var(--accent-weak)",
              color: "var(--accent)",
              whiteSpace: "nowrap",
            }}
          >
            {/* The keystone-red RUNNING pulse dot — tick-driven, held steady under reduced motion. */}
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: "var(--keystone)",
                opacity: pulse ? 1 : 0.25,
                transition: "opacity 0.12s linear",
              }}
            />
            {pill.label}
          </span>
        ) : (
          <Pill tone={pill.tone}>{pill.label}</Pill>
        )}
        <div style={{ flex: 1 }} />
        {/* LIVE / CACHED chip from the real per-stage source. */}
        {status === "done" && !skipped && source && (
          <span
            className="mono"
            data-testid="live-pipeline-source"
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.06em",
              padding: "2px 7px",
              borderRadius: 999,
              border: `1px solid ${source === "live" ? "var(--ok)" : "var(--hair-strong)"}`,
              color: source === "live" ? "var(--ok)" : "var(--muted)",
            }}
          >
            {source === "live" ? "LIVE" : "CACHED"}
          </span>
        )}
      </div>

      {/* Elapsed + gather count. */}
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, minHeight: 13 }}>
        {gatherCount != null && gatherCount > 0 ? `${gatherCount} findings · ` : ""}
        {elapsed ?? ""}
      </div>
    </div>
  );
}
