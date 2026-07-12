import Link from "next/link";
import { SectionHeader } from "@/ui/primitives";
import { MiniCollapseHero } from "./MiniCollapseHero";
import { SystemAtWork } from "./SystemAtWork";
import { RecentDecisions } from "./RecentDecisions";

// V5-1 · LANDING (/) — the product landing. Terminal/CAD ledger aesthetic throughout
// (hairlines, zero radius, mono numerals, warm paper). Server component: the working app lives at
// /studio; this page opens with a HERO (headline + the live mini-collapse), then shows the whole
// pipeline running, how it works, the manifesto, the vocabulary ledger, and the honest-architecture
// panel. `startedAt` is stamped server-side (T8) and threaded to the (V5-4) decisions ledger seam.

// The four-beat arc of the product, shown as the hero's "how it works" strip.
const PIPELINE: { k: string; d: string }[] = [
  { k: "CONTEXT", d: "your repo, site, rivals, calendar" },
  { k: "STRUCTURE", d: "claims resting on assumptions" },
  { k: "STRESS", d: "grounded load + adversarial attacks" },
  { k: "KEYSTONE", d: "the one that can't be wrong" },
];

// The manifesto — the product thesis, verbatim from the track quote. Four heart lines
// that build to the payoff question. The weaker "Can we design thoughts…" opener is
// dropped; the inverted band lets these four carry the weight themselves.
const MANIFESTO_LINES: string[] = [
  "Ideas have constraints.",
  "Beliefs have dependencies.",
  "Plans have load-bearing assumptions.",
  "Taste has geometry.",
];
const MANIFESTO_QUESTION = "What would a CAD tool for thinking look like?";

// HOW IT WORKS — the DESIGN → TEST → ASSEMBLE arc (v6 spec §4). One short line each.
const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "DESIGN",
    body: "State the goal. Three rival structures compete under identical stress; the deterministic solver keeps the survivor.",
  },
  {
    n: "2",
    title: "TEST",
    body: "Interrogate the survivor — grounded load and an adversarial wind tunnel probe every load-bearing assumption.",
  },
  {
    n: "3",
    title: "ASSEMBLE",
    body: "Each result joins the skyline, exposing the assumption that props up more than one decision.",
  },
];

// HOW TO READ A STRUCTURE — the six essentials a first-time reader needs, in plain
// English, each chip coloured to match the node it names on the graph (--thesis / --claim
// / --assumption / --keystone from theme.css == @/ui/tokens); INTEGRITY + LOAD borrow the
// verdict-good and stress accents.
const LEGEND: { term: string; color: string; line: string }[] = [
  { term: "THESIS", color: "var(--thesis)", line: "The decision itself — the thing you're weighing." },
  { term: "CLAIM", color: "var(--claim)", line: "What the decision rests on: the reasons it's a good idea." },
  { term: "ASSUMPTION", color: "var(--assumption)", line: "What those claims quietly take for granted underneath." },
  { term: "KEYSTONE", color: "var(--keystone)", line: "The one assumption that, if it's wrong, brings the whole thing down." },
  { term: "INTEGRITY", color: "var(--ok)", line: "The 0–100 verdict — how much of the structure still stands." },
  { term: "LOAD", color: "var(--warn)", line: "The adversarial stress you apply to see what survives." },
];

// The CONTEXT → STRUCTURE → STRESS → KEYSTONE strip — the whole product in four beats.
function PipelineStrip() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "stretch",
        gap: 8,
        border: "1px solid var(--hair-strong)",
        background: "var(--panel)",
      }}
    >
      {PIPELINE.map((p, i) => (
        <div
          key={p.k}
          style={{
            flex: "1 1 150px",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderLeft: i === 0 ? "none" : "1px solid var(--hair)",
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 11, color: i === PIPELINE.length - 1 ? "var(--keystone)" : "var(--muted)" }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              className="label"
              style={{
                letterSpacing: "0.12em",
                color: i === PIPELINE.length - 1 ? "var(--keystone)" : "var(--ink)",
              }}
            >
              {p.k}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.35, marginTop: 2 }}>{p.d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Landing({ startedAt }: { startedAt: string }) {
  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      {/* Nameplate — echoes the studio TopBar, now with the primary nav CTAs. */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: 52,
          padding: "0 var(--pad)",
          borderBottom: "1px solid var(--hair-strong)",
          background: "var(--panel)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--sans)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          ▣ Keystone
        </span>
        <span className="label landing-hide-narrow">Structural Analysis for Decisions</span>
        <div style={{ flex: 1 }} />
        <Link
          href="/login"
          className="btn"
          style={{ textDecoration: "none", padding: "8px 16px" }}
        >
          Sign in
        </Link>
        <Link
          href="/studio"
          className="btn btn-primary"
          style={{ textDecoration: "none", padding: "8px 16px" }}
        >
          Open Studio
        </Link>
      </header>

      {/* Terminal status strip — sells the ledger identity; server-stamped session. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          minHeight: 30,
          padding: "5px var(--pad)",
          borderBottom: "1px solid var(--hair)",
          background: "var(--panel)",
        }}
      >
        <span className="label" style={{ letterSpacing: "0.14em" }}>
          SESSION
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          {startedAt}
        </span>
        <span style={{ color: "var(--hair-strong)" }}>·</span>
        <span className="chip">PINNED FIXTURE</span>
        <span className="chip">REAL SOLVER</span>
        <div style={{ flex: 1 }} />
        <span className="label landing-hide-narrow" style={{ letterSpacing: "0.14em" }}>
          DETERMINISTIC · KEYLESS · NEVER 500s
        </span>
      </div>

      {/* ── HERO ── two columns, above the fold: LEFT copy + CTAs + pipeline,
          RIGHT the live terminal viewport, over a low-contrast blueprint grid. */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid var(--hair-strong)",
        }}
      >
        <div className="blueprint-grid" aria-hidden />
        <div
          style={{
            position: "relative",
            maxWidth: 1180,
            margin: "0 auto",
            padding: "44px 24px 52px",
          }}
        >
          <div className="hero-grid">
            {/* LEFT — the pitch. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              <span className="label" style={{ letterSpacing: "0.18em", color: "var(--muted)" }}>
                ▣ CAD FOR DECISIONS · GROUNDED IN YOUR REAL CONTEXT
              </span>

              <h1
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: "clamp(30px, 4.6vw, 46px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.06,
                  margin: 0,
                }}
              >
                Find the one assumption your decision{" "}
                <span style={{ color: "var(--keystone)" }}>can&apos;t survive without.</span>
              </h1>

              <p style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.55, margin: 0, maxWidth: 540 }}>
                Describe a decision. Keystone builds it as a{" "}
                <strong style={{ fontWeight: 600, color: "var(--ink)" }}>load-bearing structure</strong>,
                stress-tests it under your real grounded context, and surfaces the{" "}
                <strong style={{ fontWeight: 600, color: "var(--keystone)" }}>keystone</strong> — the
                assumption that, if it&apos;s wrong, brings the whole thing down.
              </p>

              {/* CTAs. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 2 }}>
                <Link
                  href="/studio"
                  className="btn btn-primary"
                  style={{ textDecoration: "none", fontSize: 13, padding: "14px 32px", letterSpacing: "0.14em" }}
                >
                  Open Studio
                </Link>
                <Link
                  href="/login"
                  className="btn"
                  style={{ textDecoration: "none", fontSize: 13, padding: "14px 32px", letterSpacing: "0.14em" }}
                >
                  Sign in
                </Link>
              </div>

              {/* CONTEXT → STRUCTURE → STRESS → KEYSTONE — the whole product in four beats. */}
              <PipelineStrip />
            </div>

            {/* RIGHT — the live terminal viewport: the real solver on the pinned fixture. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <div className="term-viewport">
                <div className="term-header">
                  <span className="live-dot" aria-hidden />
                  <span className="label" style={{ letterSpacing: "0.14em", color: "var(--keystone)" }}>
                    LIVE
                  </span>
                  <span className="label" style={{ letterSpacing: "0.12em" }}>
                    · REAL SOLVER
                  </span>
                  <div style={{ flex: 1 }} />
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    migrate to microservices
                  </span>
                </div>
                {/* Borderless: the term-viewport supplies the frame; MiniStructure scales to fit. */}
                <MiniCollapseHero fit style={{ border: "none", background: "transparent" }} />
              </div>
              <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, margin: "0 2px" }}>
                Grounded on tomorrow&apos;s enterprise meeting: the structure stands, grounded load
                craters the integrity as the keystone cracks, then the De-risking plan restores it.
                Every number is the real engine&apos;s output — no mockups.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "56px 24px 72px",
          display: "flex",
          flexDirection: "column",
          gap: 56,
        }}
      >
        {/* HOW IT WORKS — one merged section: watch the loop run, then read the three-beat arc. */}
        <section>
          <SectionHeader>How it works — one loop</SectionHeader>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 14px", maxWidth: 640 }}>
            Every agent, doing its job — auto-playing and deterministic. Hover any lane or stage to pause
            and inspect it.
          </p>
          <SystemAtWork />
          <div
            className="landing-3col"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 16 }}
          >
            {STEPS.map((s) => (
              <div key={s.n} className="panel" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  <span className="mono" style={{ fontSize: 20, color: "var(--ink)" }}>{s.n}</span>
                  <span className="label" style={{ letterSpacing: "0.12em", color: "var(--ink)" }}>{s.title}</span>
                </div>
                <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* MANIFESTO — the product thesis as an inverted editorial band: four heart lines set
            large on hairline rows, building to the payoff question behind a keystone-red rule. */}
        <section
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            padding: "clamp(30px, 5.5vw, 56px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "clamp(22px, 4vw, 40px)" }}>
            <span className="label" style={{ letterSpacing: "0.22em", color: "var(--bg)", opacity: 0.55 }}>
              MANIFESTO
            </span>
            <span aria-hidden style={{ flex: 1, height: 1, background: "rgba(245,244,239,0.22)" }} />
            <span className="label" style={{ letterSpacing: "0.22em", color: "var(--bg)", opacity: 0.55 }}>
              THE THESIS
            </span>
          </div>

          <div style={{ borderTop: "1px solid rgba(245,244,239,0.18)" }}>
            {MANIFESTO_LINES.map((line, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "clamp(12px, 2.4vw, 26px)",
                  padding: "clamp(15px, 2.7vw, 26px) 0",
                  borderBottom: "1px solid rgba(245,244,239,0.18)",
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 12, color: "var(--bg)", opacity: 0.4, flex: "0 0 auto", width: 22 }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: "clamp(20px, 3.6vw, 36px)",
                    lineHeight: 1.14,
                    fontWeight: 500,
                    letterSpacing: "-0.015em",
                    color: "var(--bg)",
                    minWidth: 0,
                  }}
                >
                  {line}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "clamp(24px, 4.5vw, 46px)",
              borderLeft: "3px solid var(--keystone)",
              paddingLeft: "clamp(16px, 3vw, 28px)",
            }}
          >
            <span
              className="label"
              style={{ letterSpacing: "0.2em", color: "var(--bg)", opacity: 0.5, display: "block", marginBottom: 10 }}
            >
              SO —
            </span>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--sans)",
                fontSize: "clamp(25px, 4.6vw, 46px)",
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: "var(--bg)",
              }}
            >
              {MANIFESTO_QUESTION}
            </p>
          </div>
        </section>

        {/* HOW TO READ A STRUCTURE — the plain-English legend keyed to the graph's node colours. */}
        <section>
          <SectionHeader>How to read a structure</SectionHeader>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 16px", maxWidth: 640 }}>
            The graph reads top-down — a thesis resting on claims, resting on assumptions. The chips
            below match the node colours you&apos;ll see in the studio.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
              gap: "2px 28px",
            }}
          >
            {LEGEND.map((item) => (
              <div
                key={item.term}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: "13px 0",
                  borderTop: "1px solid var(--hair)",
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 12, height: 12, background: item.color, flex: "0 0 auto", marginTop: 3 }}
                />
                <div style={{ minWidth: 0 }}>
                  <span className="label" style={{ color: "var(--ink)", letterSpacing: "0.12em" }}>
                    {item.term}
                  </span>
                  <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    {item.line}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CLOSING CTA band — OPEN STUDIO primary, VIEW SKYLINE secondary, plus the real-sample shortcut. */}
        <section
          className="panel"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "36px 24px" }}
        >
          <span className="label" style={{ letterSpacing: "0.18em", color: "var(--muted)" }}>
            STRESS-TEST A DECISION BEFORE YOU BET ON IT
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
            <Link
              href="/studio"
              className="btn btn-primary"
              style={{ textDecoration: "none", fontSize: 14, padding: "16px 40px", letterSpacing: "0.14em" }}
            >
              Enter Studio
            </Link>
            <Link
              href="/skyline"
              className="btn"
              style={{ textDecoration: "none", fontSize: 14, padding: "16px 40px", letterSpacing: "0.14em" }}
            >
              View Skyline
            </Link>
          </div>
          <Link
            href="/studio"
            className="label"
            style={{ textDecoration: "underline", textUnderlineOffset: 4, letterSpacing: "0.1em", color: "var(--ink-2)" }}
          >
            Or open the real sample — Excalidraw →
          </Link>
        </section>

        {/* DECISIONS ledger — V5-4 reads recent snapshots from the library client-side. */}
        <RecentDecisions />

        {/* Honest-architecture, collapsed to a single compact trust line. */}
        <p
          style={{
            fontSize: 12,
            color: "var(--ink-2)",
            lineHeight: 1.6,
            margin: 0,
            paddingTop: 12,
            borderTop: "1px solid var(--hair)",
          }}
        >
          <span className="label" style={{ letterSpacing: "0.14em", color: "var(--ink)", marginRight: 8 }}>
            DETERMINISTIC ENGINE
          </span>
          The model proposes the shape; a pure solver decides whether it stands — and cannot override
          it. Runs fully offline on a pinned real fixture; the API routes never 500.
        </p>

        {/* Footer — session stamp keeps the ledger honesty. */}
        <footer style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 8 }}>
          <span className="label" style={{ letterSpacing: "0.14em", color: "var(--muted)" }}>
            ▣ Keystone · Structural Analysis for Decisions
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            SESSION {startedAt}
          </span>
        </footer>
      </div>
    </main>
  );
}
