import Link from "next/link";
import { SectionHeader } from "@/ui/primitives";
import { MiniCollapseHero } from "./MiniCollapseHero";
import { RecentDecisions } from "./RecentDecisions";

// V5-1 · LANDING (/) — the concept explainer. Terminal/CAD aesthetic throughout
// (hairlines, zero radius, mono numerals, warm paper). Server component: the working
// app lives at /studio; this page renders a LIVE mini-collapse hero, the manifesto,
// how-it-works, the vocabulary ledger, and the honest-architecture panel. `startedAt`
// is stamped server-side (T8) and threaded to the (V5-4) decisions ledger seam.

// The track manifesto — verbatim from the README pitch quote.
const MANIFESTO: string[] = [
  "Can we design thoughts the way engineers design machines?",
  "Ideas have constraints.",
  "Beliefs have dependencies.",
  "Plans have load-bearing assumptions.",
  "Taste has geometry.",
  "What would a CAD tool for thinking look like?",
];

// HOW IT WORKS — the DESIGN → TEST → ASSEMBLE arc (v6 spec §4).
const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "DESIGN",
    body: "State the goal. Three rival structures — one per strategy lens — are synthesized and stress-tested under identical load; the deterministic solver picks the survivor.",
  },
  {
    n: "2",
    title: "TEST",
    body: "Interrogate the survivor. Grounded load either collapses it or not, the wind tunnel cross-examines it — prosecutor vs advocate, solver as referee — and the De-risking plan prescribes the minimal set of assumptions to prove.",
  },
  {
    n: "3",
    title: "ASSEMBLE",
    body: "Every analysis joins the skyline. Shared foundations reveal which single assumption props up multiple decisions — and where systemic risk hides.",
  },
];

// VOCABULARY — one-line definitions. Basics first (v5 domain model), then the v6 mechanics
// (definitions verbatim-faithful to the v6 spec's vocabulary section) so a first-time reader
// builds up from the Structure to the Skyline.
const VOCAB: { term: string; def: string }[] = [
  { term: "KEYSTONE", def: "The load-bearing assumption: max knockout-sensitivity impact." },
  { term: "INTEGRITY", def: "Thesis support ×100; the verdict number. HOLDING ≥35 / STRESSED 10–35 / FAILED <10." },
  { term: "STRATA / DEPTH", def: "Reasoning depth layers L0–L3: THESIS / CLAIMS / ASSUMPTIONS / EVIDENCE. DEPTH = strata present + grounding coverage." },
  { term: "EVIDENCE PLATE", def: "A source-fact plate hanging below a grounded assumption. Ungrounded assumptions float." },
  { term: "CONSTRAINT PLANE", def: "A context constraint as a CAD datum frame; attacks matching its category STRIKE it → VIOLATED ×n." },
  { term: "LOAD / ATTACK", def: "Severity-weighted stress on an assumption; context grounding reweights severities." },
  { term: "DE-RISKING PLAN", def: "The provably-minimal set of assumptions to restore so the Structure survives (reinforcement)." },
  { term: "RIVAL CANDIDATES", def: "Alternative Structures for the same goal, synthesized under different strategy lenses and stress-tested under identical grounded load. The survivor wins." },
  { term: "STRATEGY LENS", def: "The stance a candidate is generated under: AGGRESSIVE (speed/upside), CONSERVATIVE (de-risk first), HYBRID (staged)." },
  { term: "WIND TUNNEL", def: "An adversarial interrogation of one Structure: a PROSECUTOR agent proposes novel attacks, an ADVOCATE agent counters with evidence; the pure solver referees every round and cannot be overridden." },
  { term: "SHARED FOUNDATION", def: "An assumption that appears (by deterministic label similarity) in more than one saved decision; a load-bearing column under multiple buildings. Cracking it re-verdicts every structure resting on it." },
  { term: "SKYLINE", def: "The whole library rendered as one assembly: every decision a building, shared foundations beneath." },
];

function VocabRow({ term, def }: { term: string; def: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 16,
        alignItems: "baseline",
        padding: "10px 2px",
        borderBottom: "1px solid var(--hair)",
      }}
    >
      <span className="label" style={{ letterSpacing: "0.1em", color: "var(--ink)" }}>
        {term}
      </span>
      <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{def}</span>
    </div>
  );
}

export default function Landing({ startedAt }: { startedAt: string }) {
  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh" }}>
      {/* Nameplate — echoes the studio TopBar. */}
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
        <span className="label">Structural Analysis for Decisions</span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
          {startedAt}
        </span>
      </header>

      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "48px 24px 72px",
          display: "flex",
          flexDirection: "column",
          gap: 56,
        }}
      >
        {/* Manifesto ledger. */}
        <section>
          <h1
            style={{
              fontFamily: "var(--sans)",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              margin: "0 0 6px",
            }}
          >
            A CAD tool for thinking.
          </h1>
          <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 24px", maxWidth: 640 }}>
            Keystone treats a decision as a load-bearing structure: the LLM proposes the shape, and a
            deterministic solver decides whether it stands — which assumption is the keystone, which
            constraints it violates, and how it fails under load.
          </p>
          <SectionHeader>Manifesto</SectionHeader>
          <div>
            {MANIFESTO.map((line, i) => (
              <div
                key={i}
                className="ledger-row"
                style={{ height: "auto", padding: "10px 2px" }}
              >
                <span style={{ fontSize: 14, color: "var(--ink)", fontStyle: "italic" }}>{line}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* LIVE mini-collapse hero. */}
        <section>
          <SectionHeader>Live · Hero A — migrate under load</SectionHeader>
          <MiniCollapseHero />
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "10px 2px 0" }}>
            The real solver on the pinned hero fixture: tomorrow&apos;s enterprise meeting grounds the
            attacks, the keystone crosses its failure threshold, and the De-risking plan restores it.
          </p>
        </section>

        {/* HOW IT WORKS. */}
        <section>
          <SectionHeader>How it works</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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

        {/* VOCABULARY ledger. */}
        <section>
          <SectionHeader>Vocabulary</SectionHeader>
          <div>
            {VOCAB.map((v) => (
              <VocabRow key={v.term} term={v.term} def={v.def} />
            ))}
          </div>
        </section>

        {/* HONEST ARCHITECTURE panel. */}
        <section>
          <SectionHeader>Honest architecture</SectionHeader>
          <div className="panel" style={{ padding: 20 }}>
            <p
              style={{
                fontFamily: "var(--sans)",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "0.02em",
                lineHeight: 1.45,
                margin: "0 0 16px",
                textTransform: "uppercase",
              }}
            >
              The LLM proposes the shape. A pure deterministic solver decides whether it stands. The LLM
              cannot override the solver.
            </p>
            <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: "0 0 8px" }}>
              Every live path falls back to a pinned fixture — the offline demo works fully and keylessly,
              deterministic and identical every run. The API routes never 500; each stage reports its true
              live | fixture source.
            </p>
            <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
              Scenario R is not a toy: it was generated live against a real project —
              github.com/excalidraw/excalidraw and excalidraw.com — then pinned as fixtures, so every
              citation is a real file path or URL. Baseline integrity 52.6%, keystone
              team_has_backend_capacity, evidence coverage 6/6.
            </p>
          </div>
        </section>

        {/* CTAs — ENTER STUDIO primary, VIEW SKYLINE secondary, plus the real-sample shortcut. */}
        <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
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
            className="btn"
            style={{ textDecoration: "none", letterSpacing: "0.1em" }}
          >
            Open the real sample — Excalidraw
          </Link>
        </section>

        {/* DECISIONS ledger — V5-4 reads recent snapshots from the library client-side. */}
        <RecentDecisions />
      </div>
    </main>
  );
}
