// generate-scenario-r.mjs — build scenario R (a REAL project) by driving the RUNNING dev
// server end-to-end: three live gather agents (technical repo clone + explore, business site
// crawl, temporal notes) → live /api/context compile → live /api/extract (evidence-grounded)
// → live /api/attacks. Every stage that falls back to a fixture is RETRIED once; a persistent
// fixture is reported so a human can decide whether to adapt (branch/depth/smaller repo).
//
// The complete artifact set (findings per kind, companyContext + pack, graph, attacks, and each
// stage's provenance) is written pretty-printed to scripts/scenario-r.artifacts.json, then
// inlined by hand into src/context/fixtures.ts as scenario R (real provenance kept verbatim).
//
// Usage:  node scripts/generate-scenario-r.mjs
//         BASE_URL=http://localhost:3002 node scripts/generate-scenario-r.mjs
//
// Requires the dev server running WITH a valid ANTHROPIC_API_KEY (npm run dev).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3002";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "scenario-r.artifacts.json");

// ── The REAL project ────────────────────────────────────────────────────────
const REPO_URL = "https://github.com/excalidraw/excalidraw";
const FALLBACK_REPO_URL = "https://github.com/tldraw/tldraw"; // still real; only if excalidraw clone is too slow
const WEBSITE = "https://excalidraw.com";
const COMPETITORS = ["tldraw", "Figma FigJam", "Miro"];
// Real-shaped situation. Enriched past MIN_FACTS=5 (src/agents/schemas.ts) so the live temporal
// agent extracts ≥5 source-attributed facts — the terse 4-fact original tripped the fixture floor.
const TEMPORAL_NOTES =
  "Excalidraw+ subscription growth has been flat for two quarters. Competitor tldraw just raised " +
  "a $10M Series A and is shipping a realtime collaboration SDK aggressively. Internal team " +
  "planning meeting on the collaboration roadmap is in 2 days. A conference talk on our " +
  "collaboration story has a submission deadline in 3 weeks. The next quarterly board update " +
  "covering the monetization plan is in 6 weeks.";
const DECISION =
  "Should Excalidraw build a paid realtime-collaboration backend (own infra) now, instead of " +
  "continuing to rely on the open-source excalidraw-room and third-party embeds?";

// ── SSE parsing (from scripts/smoke-live.mjs) ────────────────────────────────
function parseSSE(text) {
  return text
    .split("\n\n")
    .filter((c) => c.includes("data:"))
    .map((chunk) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      return JSON.parse(line.slice(5).trim());
    });
}

/** One gather run: POST /api/gather, echo progress, return { findings, source }. */
async function gatherOnce(kind, source) {
  const res = await fetch(`${BASE_URL}/api/gather`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, source }),
  });
  if (!res.ok) throw new Error(`gather ${kind}: HTTP ${res.status}`);
  const events = parseSSE(await res.text());
  for (const e of events) {
    if (e.type === "status") console.log(`    … ${e.message}`);
    else if (e.type === "finding") console.log(`    • ${e.finding.label}: ${e.finding.value}  [${e.finding.source}]`);
    else if (e.type === "error") console.log(`    ! error: ${e.message}`);
  }
  const done = events.find((e) => e.type === "done");
  if (!done) throw new Error(`gather ${kind}: no done event`);
  return { findings: done.findings, source: done.source };
}

/** Gather with one retry if the first attempt fell back to a fixture. */
async function gather(kind, source, label) {
  console.log(`\n→ GATHER ${kind.toUpperCase()}  (${label})`);
  let out = await gatherOnce(kind, source);
  if (out.source !== "live") {
    console.log(`  ⟳ ${kind} fell back to fixture — retrying once…`);
    out = await gatherOnce(kind, source);
  }
  console.log(`  ${kind}: source=${out.source}, ${out.findings.facts.length} facts`);
  return out;
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const source = res.headers.get("x-keystone-source"); // extract/attacks carry it on the header
  const json = await res.json();
  return { json, headerSource: source };
}

async function main() {
  console.log(`Keystone scenario R — live generation against ${BASE_URL}`);

  // ── (a) technical — clone + explore a real repo. Retry, then fall back to a smaller real repo.
  let tech = await gather("technical", { repoUrl: REPO_URL }, REPO_URL);
  let repoUsed = REPO_URL;
  if (tech.source !== "live") {
    console.log(`  ⚠ excalidraw clone/explore still fixtured — trying fallback real repo ${FALLBACK_REPO_URL}`);
    tech = await gather("technical", { repoUrl: FALLBACK_REPO_URL }, FALLBACK_REPO_URL);
    repoUsed = FALLBACK_REPO_URL;
  }

  // ── (b) business — crawl the real site + competitors.
  const biz = await gather("business", { website: WEBSITE, competitors: COMPETITORS }, WEBSITE);

  // ── (c) temporal — parse the real-shaped situation notes.
  const temp = await gather("temporal", { notes: TEMPORAL_NOTES }, "planning notes");

  // ── (d) context compile — the three summaries + the decision, NO scenario (live path).
  console.log(`\n→ COMPILE /api/context`);
  const contextInput = {
    businessContextText: biz.findings.summary,
    technicalContextText: tech.findings.summary,
    temporalContextText: temp.findings.summary,
    decisionText: DECISION,
  };
  const { json: ctx } = await postJson("/api/context", contextInput);
  console.log(`  context source=${ctx.source}; ${ctx.decisionContextPack.contextWeightAdjustments.length} weight adjustments, ${ctx.decisionContextPack.relevantConstraints.length} constraints`);

  // ── (e) extract — pack + ALL gathered findings mapped to { source, fact }. Evidence-rich.
  const findings = [...tech.findings.facts, ...biz.findings.facts, ...temp.findings.facts].map((f) => ({
    source: f.source,
    fact: `${f.label}: ${f.value}`,
  }));
  console.log(`\n→ EXTRACT /api/extract  (${findings.length} findings threaded)`);
  const { json: graph, headerSource: graphSource } = await postJson("/api/extract", {
    decision: DECISION,
    pack: ctx.decisionContextPack,
    findings,
  });
  console.log(`  extract source=${graphSource}; ${graph.nodes.length} nodes`);

  // ── (f) attacks — graph + pack.
  console.log(`\n→ ATTACKS /api/attacks`);
  const { json: attacksRes, headerSource: attacksSource } = await postJson("/api/attacks", {
    graph,
    pack: ctx.decisionContextPack,
  });
  const attacks = attacksRes.attacks;
  console.log(`  attacks source=${attacksSource}; ${attacks.length} attacks`);

  // ── Persist the full artifact set ──────────────────────────────────────────
  const artifact = {
    meta: {
      generatedFrom: BASE_URL,
      repoUrl: repoUsed,
      website: WEBSITE,
      competitors: COMPETITORS,
      decision: DECISION,
      temporalNotes: TEMPORAL_NOTES,
      sources: {
        technical: tech.source,
        business: biz.source,
        temporal: temp.source,
        context: ctx.source,
        extract: graphSource,
        attacks: attacksSource,
      },
    },
    contextInput,
    findings: { technical: tech.findings, business: biz.findings, temporal: temp.findings },
    extractFindings: findings,
    companyContext: ctx.companyContext,
    decisionContextPack: ctx.decisionContextPack,
    graph,
    attacks,
  };
  writeFileSync(OUT, JSON.stringify(artifact, null, 2));

  // ── Summary ──────────────────────────────────────────────────────────────
  const assumptions = graph.nodes.filter((n) => n.type === "assumption");
  const grounded = assumptions.filter((n) => n.evidence && n.evidence.source);
  const coverage = assumptions.length ? (100 * grounded.length) / assumptions.length : 0;
  const categories = [...new Set(attacks.map((a) => a.category))];

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`SCENARIO R — LIVE GENERATION SUMMARY`);
  console.log(`  repo used:        ${repoUsed}`);
  console.log(`  stage provenance: ${JSON.stringify(artifact.meta.sources)}`);
  console.log(`  nodes:            ${graph.nodes.length} (thesis=${graph.thesisId})`);
  console.log(`  assumptions:      ${assumptions.length}, grounded=${grounded.length} (${coverage.toFixed(0)}% evidence coverage)`);
  console.log(`  constraints:      ${ctx.decisionContextPack.relevantConstraints.length}`);
  console.log(`  attacks:          ${attacks.length}; categories=${JSON.stringify(categories)}`);
  console.log(`  weight adjust:    ${ctx.decisionContextPack.contextWeightAdjustments.map((w) => `${w.targetCategory}${w.direction === "increase" ? "▲" : "▼"}${w.magnitude}`).join(" ")}`);
  console.log(`\n  artifact written: ${OUT}`);
  const allLive = Object.values(artifact.meta.sources).every((s) => s === "live");
  console.log(allLive ? `\n✓ ALL STAGES LIVE.` : `\n⚠ SOME STAGES FIXTURED — see stage provenance above.`);
}

main().catch((err) => {
  console.error(`✗ ${err.stack || err.message}`);
  console.error("  Is the dev server running with a key? Try: npm run dev");
  process.exit(1);
});
