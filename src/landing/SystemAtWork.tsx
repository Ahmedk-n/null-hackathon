"use client";
// V5 · THE SYSTEM AT WORK — an auto-playing, deterministic ~18.8s montage of EVERY Keystone
// agent doing its job, in the terminal/CAD visual language of the studio:
//
//   STAGE 1 · GATHER   — three lanes (TECHNICAL / BUSINESS / TEMPORAL) stream real, source-
//                        attributed findings simultaneously (scan-line / radar / calendar motifs).
//   STAGE 2 · COMPILE  — the findings FLOW as particles down hairline wires into a COMPILE node;
//                        a compact CONTEXT pack forms (real key/value ledger rows).
//   STAGE 3 · GENERATE — three RIVAL structures assemble in a row (the shared <MiniStructure/>),
//                        one per strategy lens; the survivor takes a ✓ accent.
//   STAGE 4 · WIND TUNNEL — the survivor is interrogated: PROSECUTOR ▶ attacks, SOLVER ■ referees
//                        every round (real integrity delta), ADVOCATE ◀ counters with evidence.
//   STAGE 5 · VERDICT  — the keystone holds or cracks; a final stamp; brief hold; then it LOOPS.
//
// PURE + LOCAL. Driven by a single `tick` counter advanced by setInterval (cleanup-safe). It reads
// no wall-clock and no randomness — every frame is a pure function of `tick` (GOAL T8). SSR-safe:
// tick 0 renders cleanly (mirrors MiniCollapseHero). It imports only pure, client-safe modules
// (deep engine/context/ui paths — never the `@/context` or `@/agents` barrels; no SDK, no key).
//
// The GATHER findings are the scripted agent fixtures VERBATIM (real repo paths + competitor URLs +
// the "meeting tomorrow" beat). The pack, rivals, and duel are the pinned REAL Excalidraw run
// (scenario R): the CONTEXT pack rows, the three lens candidates, and the scripted PROSECUTOR ⟷
// ADVOCATE duel — every citation a real file path or URL — all refereed by the pure solver here.
import { useEffect, useMemo, useRef, useState } from "react";
import { integrity, keystone } from "@/engine";
import { fixtureDecisionContextPackR, fixtureDesignCandidatesR } from "@/context/fixtures";
import {
  applyCounter,
  applyProposal,
  initTunnelSession,
  scriptedDuelGraphR,
  scriptedDuelR,
  HOLD_THRESHOLD,
} from "@/context/tunnel";
import { MiniStructure, layoutStructure, type MiniPlaced } from "@/ui/MiniStructure";
import {
  BAD,
  CLAIM,
  HAIR,
  HAIR_STRONG,
  INCREASE,
  INK,
  INK_2,
  KEYSTONE,
  MUTED,
  OK,
  PANEL,
  PANEL_2,
  THESIS,
  WARN,
} from "@/ui/tokens";

// ── Timeline (one tick = 80ms · 235 ticks = 18.8s) ──────────────────────────
const TICK_MS = 80;
const TOTAL_TICKS = 235;
const GATHER_END = 76; //  [0,76)    stage 1 · gather        (6.1s)
const COMPILE_END = 110; // [76,110)  stage 2 · compile       (2.7s)
const GENERATE_END = 148; //[110,148) stage 3 · generate      (3.0s)
const TUNNEL_END = 208; //  [148,208) stage 4 · wind tunnel   (4.8s)
const VERDICT_END = 225; // [208,225) stage 5 · verdict       (1.4s)
const FADE_END = TOTAL_TICKS; // [225,235) reset fade (0.8s)

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fmt = (d: number) => (d >= 0 ? "+" : "") + d.toFixed(1);

// ── Real finding lanes (VERBATIM from src/agents/fixtures.ts — kept inline so this client
// bundle never imports the `@/agents` barrel). Each fact carries its real source path/URL. ──
interface LaneFact {
  label: string;
  value: string;
  source: string;
}
interface Lane {
  key: string;
  title: string;
  motif: "scan" | "radar" | "calendar";
  sourceKind: string;
  explain: string;
  facts: LaneFact[];
}
const LANES: Lane[] = [
  {
    key: "technical",
    title: "TECHNICAL",
    motif: "scan",
    sourceKind: "FILE PATHS",
    explain: "TECHNICAL — clones your repo and reads it with scoped read-only tools.",
    facts: [
      { label: "Framework", value: "FastAPI monolith (Python)", source: "pyproject.toml" },
      { label: "Dependencies", value: "fastapi, uvicorn, sqlalchemy, pytest", source: "pyproject.toml" },
      { label: "Containerization", value: "Dockerfile present (single service)", source: "Dockerfile" },
      { label: "CI", value: "GitHub Actions: lint + pytest on push", source: ".github/workflows/ci.yml" },
      { label: "Tests", value: "pytest suite under tests/", source: "tests/" },
      { label: "Observability", value: "No tracing/metrics wiring found", source: "src/" },
      { label: "Team signal", value: "No platform/infra owner in CODEOWNERS", source: "src/" },
    ],
  },
  {
    key: "business",
    title: "BUSINESS",
    motif: "radar",
    sourceKind: "URLS",
    explain: "BUSINESS — crawls your site and competitors with web search + fetch.",
    facts: [
      { label: "Industry", value: "Enterprise fintech (regulated finance)", source: "https://company.example.com/about" },
      { label: "Segment", value: "Sells to regulated fintech + enterprise finance teams", source: "https://company.example.com" },
      { label: "Growth bottleneck", value: "Enterprise onboarding speed", source: "https://company.example.com/customers" },
      { label: "Competitor", value: "Ledgerline — incumbent platform", source: "https://ledgerline.example.com" },
      { label: "Competitor", value: "Northgate — fast-growing challenger", source: "https://northgate.example.com" },
      { label: "Buyer requirements", value: "Auditability + reliability required to close", source: "https://company.example.com/security" },
    ],
  },
  {
    key: "temporal",
    title: "TEMPORAL",
    motif: "calendar",
    sourceKind: "NOTES / AGENDA",
    explain: "TEMPORAL — parses notes and agenda for meetings and deadlines.",
    facts: [
      { label: "Upcoming meeting", value: "Enterprise customer meeting — tomorrow", source: "notes" },
      { label: "Meeting focus", value: "Reliability, auditability, timeline", source: "notes" },
      { label: "Deadline", value: "Credible near-term plan by the meeting", source: "notes" },
      { label: "Urgency", value: "High (near-term pressure ~0.85)", source: "notes" },
      { label: "Follow-up", value: "Security & reliability review next week", source: "notes" },
    ],
  },
];

// Per-lane reveal delay (a slight stagger so the three lanes feel independently live).
const LANE_DELAY: Record<string, number> = { technical: 2, business: 6, temporal: 10 };

// One-line explainers for the non-lane stages (shown on hover-focus).
const STAGE_EXPLAIN: Record<string, string> = {
  compile: "COMPILE — one model call fuses every finding into a decision context pack.",
  generate: "GENERATE — three rival structures, one per strategy lens, built in parallel.",
  tunnel: "WIND TUNNEL — a prosecutor attacks, an advocate defends, the solver referees.",
  verdict: "VERDICT — the pure deterministic solver alone decides if the keystone holds.",
};

const LENS_META: Record<string, { label: string; tone: string; mark: string; note: string }> = {
  aggressive: { label: "COLLAPSED", tone: BAD, mark: "✗", note: "grounded load craters it" },
  conservative: { label: "SURVIVOR", tone: OK, mark: "✓", note: "stands under identical load" },
  hybrid: { label: "STRESSED", tone: WARN, mark: "⚠", note: "holds only in the middle band" },
};

interface TxLine {
  role: "PROSECUTOR" | "SOLVER" | "ADVOCATE";
  marker: string;
  text: string;
  tone: string;
}

function reveal(count: number, tick: number, start: number, end: number, delay: number): number {
  if (tick >= end) return count;
  const span = end - start - delay - 4;
  const frac = clamp((tick - start - delay) / Math.max(1, span), 0, 1);
  return Math.round(frac * count);
}

export function SystemAtWork() {
  const [tick, setTick] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);

  const enter = (k: string) => {
    hoveredRef.current = k;
    setHovered(k);
  };
  const leave = () => {
    hoveredRef.current = null;
    setHovered(null);
  };

  // Cleanup-safe master clock. Hovering PAUSES auto-play (read via ref so we never reset the timer).
  useEffect(() => {
    const h = setInterval(() => setTick((t) => (hoveredRef.current ? t : (t + 1) % TOTAL_TICKS)), TICK_MS);
    return () => clearInterval(h);
  }, []);

  // ── Everything real + deterministic, computed ONCE (pure engine + pure tunnel solver). ──
  const model = useMemo(() => {
    // GENERATE — the three rival candidates, auto-laid out for the mini renderer.
    const candidates = fixtureDesignCandidatesR().map((c) => {
      const keystoneId = keystone(c.graph)?.id ?? "";
      const laid = layoutStructure(c.graph, { width: 236, height: 152, keystoneId });
      return { lens: c.lens, label: c.label, keystoneId, ...laid };
    });

    // WIND TUNNEL — replay the scripted duel through the REAL referee; capture true integrity deltas.
    const rounds = scriptedDuelR();
    let session = initTunnelSession(scriptedDuelGraphR());
    const transcript: TxLine[] = [];
    let holds = 0;
    let cracks = 0;
    let finalInt = integrity(session.graph);
    rounds.forEach((r, i) => {
      const p = applyProposal(session, r.proposal);
      const c = applyCounter(p.session, r.counter);
      const held = c.verdict.integrityAfter >= HOLD_THRESHOLD;
      if (held) holds += 1;
      else cracks += 1;
      finalInt = c.verdict.integrityAfter;
      transcript.push(
        { role: "PROSECUTOR", marker: "▶", text: `R${i + 1} · ${r.proposal.targetId} — ${r.proposal.rationale}`, tone: BAD },
        { role: "SOLVER", marker: "■", text: `INTEGRITY ${Math.round(p.verdict.integrityAfter)}% (${fmt(p.verdict.delta)})`, tone: MUTED },
        { role: "ADVOCATE", marker: "◀", text: `${r.counter.kind.toUpperCase()} — ${r.counter.citation}`, tone: OK },
        { role: "SOLVER", marker: "■", text: `INTEGRITY ${Math.round(c.verdict.integrityAfter)}% · ${held ? "HOLD" : "CRACK"}`, tone: held ? OK : BAD },
      );
      session = c.session;
    });

    // COMPILE — a compact CONTEXT pack (real rows from the pinned R pack).
    const pack = fixtureDecisionContextPackR();
    const exec = pack.contextWeightAdjustments.find((w) => w.targetCategory === "execution");
    const packRows: { k: string; v: string; accent?: string }[] = [
      { k: "DECISION", v: "Build paid realtime backend now" },
      { k: "BUSINESS", v: pack.relevantBusinessFacts[1] },
      { k: "TECHNICAL", v: pack.relevantTechnicalFacts[0] },
      { k: "TEMPORAL", v: pack.relevantTemporalFacts[0], accent: INCREASE },
      { k: "WEIGHT ▲", v: `EXECUTION +${exec?.magnitude ?? 0.8} — roadmap meeting · tiny team`, accent: INCREASE },
      { k: "KEYSTONE", v: "team_has_backend_capacity", accent: KEYSTONE },
    ];

    return {
      candidates,
      transcript,
      holds,
      cracks,
      finalInt: Math.round(finalInt),
      stands: finalInt >= HOLD_THRESHOLD,
      packRows,
    };
  }, []);

  // ── Derived frame state ─────────────────────────────────────────────────────
  const stage =
    tick < GATHER_END ? "GATHER"
    : tick < COMPILE_END ? "COMPILE"
    : tick < GENERATE_END ? "GENERATE"
    : tick < TUNNEL_END ? "WIND TUNNEL"
    : "VERDICT";

  const live = tick % 4 < 2; // deterministic blink for LIVE indicators
  const stageOpacity = tick >= FADE_END - 10 ? 1 - (tick - (FADE_END - 10)) / 10 : 1;

  // COMPILE particle progress (0..1 during the compile window; also tails the last gather ticks).
  const compileActive = tick >= GATHER_END - 6 && tick < GENERATE_END;
  const compileP = clamp((tick - (GATHER_END - 6)) / (COMPILE_END - (GATHER_END - 6)), 0, 1);

  // GENERATE local tick (drives the three candidates' bottom-up assembly).
  const genTick = clamp(tick - 110, 0, 999);
  const showVerdictChips = tick >= GENERATE_END - 12;

  // WIND TUNNEL transcript reveal (line by line).
  const txShown = reveal(model.transcript.length, tick, 148, TUNNEL_END, 0);
  const txVisible = model.transcript.slice(Math.max(0, txShown - 7), txShown);

  // opacity for a hover-focusable region.
  const dim = (k: string) => (hovered && hovered !== k ? 0.28 : 1);
  const focusStyle = (k: string) => ({
    opacity: dim(k),
    transition: "opacity 0.25s ease",
  });

  const tooltip = hovered
    ? LANES.find((l) => l.key === hovered)?.explain ?? STAGE_EXPLAIN[hovered] ?? ""
    : "";

  return (
    <div data-testid="system-at-work" onMouseLeave={leave} style={{ opacity: stageOpacity, transition: "opacity 0.3s linear" }}>
      {/* Header strip — active stage, live/paused hint, hover tooltip. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "8px 10px",
          border: `1px solid ${HAIR_STRONG}`,
          borderBottom: "none",
          background: PANEL,
        }}
      >
        <span className="label" style={{ letterSpacing: "0.14em", color: INK }}>
          PIPELINE
        </span>
        {["GATHER", "COMPILE", "GENERATE", "WIND TUNNEL", "VERDICT"].map((s) => (
          <span
            key={s}
            className="label"
            style={{
              letterSpacing: "0.1em",
              color: s === stage ? INK : MUTED,
              borderBottom: s === stage ? `2px solid ${KEYSTONE}` : "2px solid transparent",
              paddingBottom: 2,
            }}
          >
            {s}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: MUTED }}>
          {hovered ? "▮▮ PAUSED · FOCUS" : "▶ AUTO-PLAYING"}
        </span>
        <span className="label" style={{ letterSpacing: "0.1em", color: MUTED }}>
          ▮▮ hover to inspect
        </span>
      </div>

      {/* Tooltip line (reserved height so the layout never jumps). */}
      <div
        style={{
          minHeight: 24,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          borderLeft: `1px solid ${HAIR_STRONG}`,
          borderRight: `1px solid ${HAIR_STRONG}`,
          background: PANEL_2,
          fontSize: 12,
          color: tooltip ? INK_2 : MUTED,
        }}
      >
        <span className="mono" style={{ fontSize: 11 }}>
          {tooltip || "The whole system, one loop: gather → compile → generate → interrogate → verdict."}
        </span>
      </div>

      {/* ── FRAME 1 · GATHER + COMPILE ─────────────────────────────────────── */}
      <div style={{ border: `1px solid ${HAIR_STRONG}`, borderTop: "none", background: PANEL, padding: 12 }}>
        <StageTag n="1 / 2" title="GATHER  ·  COMPILE" active={stage === "GATHER" || stage === "COMPILE"} />

        {/* Three lanes, running simultaneously. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
          {LANES.map((lane) => {
            const shown = reveal(lane.facts.length, tick, 0, GATHER_END, LANE_DELAY[lane.key]);
            return (
              <div
                key={lane.key}
                onMouseEnter={() => enter(lane.key)}
                title={lane.explain}
                style={{
                  border: `1px solid ${hovered === lane.key ? INK : HAIR}`,
                  background: PANEL,
                  padding: 8,
                  cursor: "help",
                  ...focusStyle(lane.key),
                }}
              >
                {/* Lane header: title · live dot · N ✓ counter. */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span className="label" style={{ color: INK, letterSpacing: "0.1em" }}>
                    {lane.title}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      background: OK,
                      opacity: live ? 1 : 0.25,
                      transition: "opacity 0.12s linear",
                    }}
                  />
                  <span className="label" style={{ color: OK, letterSpacing: "0.06em" }}>
                    LIVE
                  </span>
                  <div style={{ flex: 1 }} />
                  <span className="mono" style={{ fontSize: 11, color: shown ? OK : MUTED }}>
                    {shown} ✓
                  </span>
                </div>

                {/* Motif — scan-line / radar / calendar. */}
                <LaneMotif motif={lane.motif} tick={tick} live={live} />

                {/* Source kind. */}
                <div className="label" style={{ fontSize: 9, color: MUTED, margin: "6px 0 4px", letterSpacing: "0.08em" }}>
                  SOURCE · {lane.sourceKind}
                </div>

                {/* Streamed findings (all rendered; opacity reveals them one by one). */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {lane.facts.map((f, i) => {
                    const on = i < shown;
                    return (
                      <div
                        key={f.label + i}
                        style={{
                          borderLeft: `2px solid ${on ? CLAIM : HAIR}`,
                          padding: "2px 6px",
                          opacity: on ? 1 : 0.16,
                          transform: on ? "translateX(0)" : "translateX(-4px)",
                          transition: "opacity 0.35s ease, transform 0.35s ease",
                        }}
                      >
                        <div style={{ fontSize: 10.5, color: INK, lineHeight: 1.3 }}>{f.value}</div>
                        <div className="mono" style={{ fontSize: 9, color: MUTED }}>
                          {f.source}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* COMPILE — particles flow down wires into the compile node, then the pack forms. */}
        <div onMouseEnter={() => enter("compile")} title={STAGE_EXPLAIN.compile} style={{ ...focusStyle("compile"), cursor: "help", marginTop: 8 }}>
          <FlowBand active={compileActive} p={compileP} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "center",
              margin: "2px 0 8px",
            }}
          >
            <span
              className="label"
              style={{
                border: `1px solid ${tick >= GATHER_END ? INK : HAIR_STRONG}`,
                color: tick >= GATHER_END ? INK : MUTED,
                background: PANEL,
                padding: "3px 10px",
                letterSpacing: "0.14em",
                transition: "color 0.2s ease, border-color 0.2s ease",
              }}
            >
              ◇ COMPILE → CONTEXT PACK
            </span>
          </div>

          {/* The context pack — key/value ledger rows forming during COMPILE. */}
          <div style={{ border: `1px solid ${HAIR}`, background: PANEL_2 }}>
            {model.packRows.map((row, i) => {
              const on = tick >= GATHER_END + i * 4;
              return (
                <div
                  key={row.k}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "108px 1fr",
                    gap: 10,
                    padding: "4px 10px",
                    borderBottom: i < model.packRows.length - 1 ? `1px solid ${HAIR}` : "none",
                    opacity: on ? 1 : 0.14,
                    transition: "opacity 0.35s ease",
                  }}
                >
                  <span className="label" style={{ color: row.accent ?? MUTED, letterSpacing: "0.08em" }}>
                    {row.k}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: row.accent ?? INK }}>
                    {row.v}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── FRAME 2 · GENERATE ─────────────────────────────────────────────── */}
      <div
        onMouseEnter={() => enter("generate")}
        title={STAGE_EXPLAIN.generate}
        style={{
          border: `1px solid ${HAIR_STRONG}`,
          borderTop: "none",
          background: PANEL,
          padding: 12,
          cursor: "help",
          ...focusStyle("generate"),
        }}
      >
        <StageTag n="3" title="GENERATE · RIVAL STRUCTURES" active={stage === "GENERATE"} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
          {model.candidates.map((c) => {
            const meta = LENS_META[c.lens];
            const survivor = c.lens === "conservative";
            return (
              <div key={c.lens} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span className="label" style={{ color: INK, letterSpacing: "0.1em" }}>
                    {c.lens.toUpperCase()}
                  </span>
                  <span
                    className="chip"
                    style={{
                      color: meta.tone,
                      borderColor: meta.tone,
                      opacity: showVerdictChips ? 1 : 0,
                      transition: "opacity 0.4s ease",
                    }}
                  >
                    {meta.mark} {meta.label}
                  </span>
                </div>
                <MiniStructure
                  nodes={c.nodes as MiniPlaced[]}
                  edges={c.edges}
                  width={c.width}
                  height={c.height}
                  keystoneId={c.keystoneId}
                  tick={genTick}
                  accented={survivor && showVerdictChips}
                  tickMs={TICK_MS}
                  testId={`rival-${c.lens}`}
                />
                <div className="mono" style={{ fontSize: 10, color: MUTED, minHeight: 14 }}>
                  {c.label} · {showVerdictChips ? meta.note : "…assembling"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FRAME 3 · WIND TUNNEL ──────────────────────────────────────────── */}
      <div
        onMouseEnter={() => enter("tunnel")}
        title={STAGE_EXPLAIN.tunnel}
        style={{
          border: `1px solid ${HAIR_STRONG}`,
          borderTop: "none",
          background: PANEL,
          padding: 12,
          cursor: "help",
          ...focusStyle("tunnel"),
        }}
      >
        <StageTag n="4" title="WIND TUNNEL · INTERROGATE THE SURVIVOR" active={stage === "WIND TUNNEL"} />

        {/* Role legend — always present (the fixed cast of the duel). */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "8px 0" }}>
          <RoleTag marker="▶" role="PROSECUTOR" color={BAD} />
          <RoleTag marker="■" role="SOLVER" color={INK} />
          <RoleTag marker="◀" role="ADVOCATE" color={OK} />
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 11, color: MUTED }}>
            {model.holds} HOLD / {model.cracks} CRACK
          </span>
        </div>

        {/* Streaming transcript (a rolling window of the last few revealed lines). */}
        <div
          style={{
            border: `1px solid ${HAIR}`,
            background: PANEL_2,
            padding: "8px 10px",
            minHeight: 132,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            justifyContent: "flex-end",
          }}
        >
          {txVisible.length === 0 ? (
            <span className="mono" style={{ fontSize: 11, color: MUTED }}>
              awaiting survivor · duel begins…
            </span>
          ) : (
            txVisible.map((ln, i) => (
              <div key={`${txShown}-${i}`} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span className="mono" style={{ fontSize: 11, color: ln.tone, width: 92, flexShrink: 0 }}>
                  {ln.marker} {ln.role}
                </span>
                <span className="mono" style={{ fontSize: 11, color: INK_2, lineHeight: 1.35 }}>
                  {ln.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── FRAME 4 · VERDICT ──────────────────────────────────────────────── */}
      <div
        onMouseEnter={() => enter("verdict")}
        title={STAGE_EXPLAIN.verdict}
        style={{
          border: `1px solid ${HAIR_STRONG}`,
          borderTop: "none",
          background: PANEL,
          padding: 12,
          cursor: "help",
          ...focusStyle("verdict"),
        }}
      >
        <StageTag n="5" title="VERDICT" active={stage === "VERDICT"} />
        <VerdictStamp
          reveal={stage === "VERDICT"}
          stands={model.stands}
          integrity={model.finalInt}
          holds={model.holds}
          cracks={model.cracks}
          tick={tick}
        />
      </div>
    </div>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────

function StageTag({ n, title, active }: { n: string; title: string; active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span className="mono" style={{ fontSize: 14, color: active ? KEYSTONE : MUTED }}>
        {n}
      </span>
      <span className="label" style={{ letterSpacing: "0.14em", color: active ? INK : MUTED }}>
        {title}
      </span>
      {active && (
        <span className="label" style={{ color: KEYSTONE, letterSpacing: "0.1em" }}>
          ● RUNNING
        </span>
      )}
    </div>
  );
}

function RoleTag({ marker, role, color }: { marker: string; role: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="mono" style={{ color, fontSize: 12 }}>
        {marker}
      </span>
      <span className="label" style={{ color, letterSpacing: "0.1em" }}>
        {role}
      </span>
    </span>
  );
}

// Lane motif — a small deterministic animation per agent (scan-line / radar / calendar).
function LaneMotif({ motif, tick, live }: { motif: "scan" | "radar" | "calendar"; tick: number; live: boolean }) {
  const H = 42;
  if (motif === "scan") {
    // A mini file-tree with a horizontal scan-line sweeping top→bottom.
    const y = ((tick % 21) / 21) * H;
    return (
      <div style={{ position: "relative", height: H, border: `1px solid ${HAIR}`, background: PANEL, overflow: "hidden" }}>
        {[0, 1, 2, 3].map((r) => (
          <div
            key={r}
            style={{
              position: "absolute",
              left: 6 + (r % 2) * 8,
              top: 6 + r * 9,
              width: 30 + ((r * 13) % 40),
              height: 3,
              background: HAIR_STRONG,
              opacity: 0.7,
            }}
          />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: y, height: 1, background: THESIS, boxShadow: `0 0 6px ${THESIS}` }} />
      </div>
    );
  }
  if (motif === "radar") {
    // A radar sweep — a rotating spoke pinging concentric rings.
    const angle = (tick * 9) % 360;
    return (
      <div style={{ position: "relative", height: H, border: `1px solid ${HAIR}`, background: PANEL, overflow: "hidden" }}>
        <svg width="100%" height={H} viewBox="0 0 100 42" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <circle cx="50" cy="21" r="18" fill="none" stroke={HAIR_STRONG} strokeWidth="0.6" />
          <circle cx="50" cy="21" r="10" fill="none" stroke={HAIR} strokeWidth="0.6" />
          <line
            x1="50"
            y1="21"
            x2={50 + 18 * Math.cos((angle * Math.PI) / 180)}
            y2={21 + 18 * Math.sin((angle * Math.PI) / 180)}
            stroke={CLAIM}
            strokeWidth="1"
          />
          <circle cx="68" cy="14" r="1.6" fill={CLAIM} opacity={live ? 1 : 0.3} />
          <circle cx="38" cy="30" r="1.4" fill={CLAIM} opacity={live ? 0.4 : 1} />
        </svg>
      </div>
    );
  }
  // calendar — a 7-cell week strip with "TOMORROW" pulsing.
  const pulse = tick % 8 < 4;
  return (
    <div style={{ height: H, border: `1px solid ${HAIR}`, background: PANEL, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
      {[0, 1, 2, 3, 4, 5, 6].map((d) => {
        const tomorrow = d === 1;
        return (
          <div
            key={d}
            style={{
              width: 15,
              height: 22,
              border: `1px solid ${tomorrow ? INCREASE : HAIR}`,
              background: tomorrow ? (pulse ? INCREASE : PANEL) : PANEL,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 8, color: tomorrow ? (pulse ? PANEL : INCREASE) : MUTED }}
            >
              {tomorrow ? "★" : d + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The COMPILE flow band — three hairline wires converge to a node; particles travel during compile.
function FlowBand({ active, p }: { active: boolean; p: number }) {
  const W = 300;
  const H = 46;
  const sources = [50, 150, 250];
  const tx = 150;
  const ty = H;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
      {sources.map((sx) => (
        <line key={sx} x1={sx} y1={0} x2={tx} y2={ty} stroke={HAIR_STRONG} strokeWidth={0.8} opacity={0.6} />
      ))}
      {active &&
        sources.map((sx) =>
          [0, 0.33, 0.66].map((off) => {
            const t = (p + off) % 1;
            return (
              <circle
                key={`${sx}-${off}`}
                cx={sx + (tx - sx) * t}
                cy={ty * t}
                r={2}
                fill={CLAIM}
                opacity={0.9}
              />
            );
          }),
        )}
    </svg>
  );
}

// The final stamp — the survivor's keystone holds (green) or cracks (red), with the tally.
function VerdictStamp({
  reveal,
  stands,
  integrity: integrityPct,
  holds,
  cracks,
  tick,
}: {
  reveal: boolean;
  stands: boolean;
  integrity: number;
  holds: number;
  cracks: number;
  tick: number;
}) {
  const color = stands ? OK : BAD;
  const cracked = !stands && reveal;
  const glow = reveal ? (stands ? `0 0 18px ${OK}55` : `0 0 22px ${BAD}88`) : "none";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
      {/* Keystone glyph. */}
      <svg width={96} height={72} viewBox="0 0 96 72" aria-hidden style={{ filter: reveal ? undefined : "opacity(0.5)" }}>
        <path
          d="M30 12 L66 12 L58 60 L38 60 Z"
          fill={reveal ? (stands ? "#eef4ee" : "#f6ecea") : PANEL}
          stroke={reveal ? color : HAIR_STRONG}
          strokeWidth={2}
          style={{ filter: glow !== "none" ? `drop-shadow(${glow})` : undefined, transition: "all 0.3s ease" }}
        />
        {cracked && (
          <polyline
            points="48,12 44,32 52,44 46,60"
            fill="none"
            stroke={BAD}
            strokeWidth={1.6}
            strokeDasharray={120}
            style={{ strokeDashoffset: tick % 2 === 0 ? 0 : 4 }}
          />
        )}
      </svg>

      {/* Verdict readout. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="mono" style={{ fontSize: 30, fontWeight: 600, color, lineHeight: 1 }}>
            {integrityPct}%
          </span>
          <span
            className="chip"
            style={{
              color,
              borderColor: color,
              fontSize: 12,
              opacity: reveal ? 1 : 0.35,
              transition: "opacity 0.3s ease",
            }}
          >
            {stands ? "◆ STRUCTURE STANDS" : "✗ KEYSTONE CRACKS"}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: MUTED }}>
          {holds} HOLD / {cracks} CRACK · the pure solver referees — the LLM cannot override it
        </span>
        <span className="label" style={{ letterSpacing: "0.1em", color: MUTED }}>
          {reveal ? "VERDICT SEALED · LOOP RESETS" : "…settling"}
        </span>
      </div>
    </div>
  );
}
