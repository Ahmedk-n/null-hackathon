// generate-design-r.mjs — build scenario R's DESIGN candidates (V6-1) by driving the RUNNING dev
// server's live path end-to-end: compile the R context live (/api/context with the real Excalidraw
// input, NO scenario) → then POST /api/design (NO scenario) with the R goal + constraints + the live
// pack, so src/llm/design.ts fires THREE lens-flavored extractions in parallel + per-candidate
// attacks. Every candidate's provenance (live | fixture) is reported.
//
// The full artifact set (goal, constraints, pack, and each candidate's lens/label/graph/attacks/
// source + engine verdict) is written to scripts/design-r.artifacts.json, then inlined by hand into
// src/context/fixtures.ts as fixtureDesignCandidatesR (real provenance kept verbatim; severities
// hand-calibrated within the [0.15,0.55] wall band for a clean tournament beat, documented there).
//
// Usage:  node scripts/generate-design-r.mjs
//         BASE_URL=http://localhost:3002 node scripts/generate-design-r.mjs
// Requires the dev server running WITH a valid ANTHROPIC_API_KEY (npm run dev).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3002";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "design-r.artifacts.json");

// The R decision material (verbatim from src/context/fixtures.ts REAL_CONTEXT_INPUT).
const REAL_INPUT = {
  businessContextText:
    "Excalidraw is a bootstrapped, open-source (MIT) collaborative whiteboard run by a ~6-person team in Brno. Freemium: Excalidraw+ is a paid seat-based cloud tier (~$6/user/mo). Competes with tldraw (~$14M raised), Figma FigJam, and Miro (~$665M ARR, $17.5B). Growth constraints: free→paid conversion, limited enterprise support capacity from the tiny team, and enterprise auditability/reliability/security demands (SOC 2 Type II + DPA) against far larger rivals.",
  technicalContextText:
    "TypeScript monorepo shipping a React 19 npm component library plus excalidraw.com. Client-heavy canvas SPA (Vite/PWA). The hosted app has no traditional backend: realtime collaboration runs over Socket.IO with E2E encryption; persistence uses Firebase Firestore/Storage with local-first idb-keyval; state via Jotai; deploy via Vercel. Observability is limited to Sentry error tracking.",
  temporalContextText:
    "Collaboration-roadmap planning meeting in 2 days (most immediate pressure). Conference talk submission on the collaboration story in 3 weeks. Quarterly board update on monetization in 6 weeks. tldraw's recent funding + aggressive SDK shipping add urgency.",
  decisionText:
    "Should Excalidraw build a paid realtime-collaboration backend (own infra) now, instead of continuing to rely on the open-source excalidraw-room and third-party embeds?",
};

// The DESIGN goal + constraints (the V6-1 showcase — win revenue without burning the tiny team).
const GOAL = "Win enterprise collaboration revenue without burning the 6-person team.";
const CONSTRAINTS = [
  "TEAM: Tiny ~6-person team with limited enterprise support capacity",
  "BUDGET: Bootstrapped; must self-fund infrastructure investments",
  "TECHNICAL: Currently no own backend; relies on excalidraw-room and Firebase",
  "REGULATORY: Enterprise SOC 2 Type II, DPA and E2E encryption expectations",
  "TIME: Roadmap planning meeting in 2 days forces near-term direction",
].join("\n");

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const headerSource = res.headers.get("x-keystone-source");
  const json = await res.json();
  return { json, headerSource };
}

async function main() {
  console.log(`Keystone DESIGN scenario R — live generation against ${BASE_URL}`);

  // (a) compile the R context live (NO scenario → live path fires with a key).
  console.log(`\n→ COMPILE /api/context (live)`);
  const { json: ctx } = await postJson("/api/context", REAL_INPUT);
  console.log(`  context source=${ctx.source}; ${ctx.decisionContextPack.contextWeightAdjustments.length} weight adjustments`);

  // (b) generate design candidates live (NO scenario → 3 lens extractions in parallel).
  console.log(`\n→ DESIGN /api/design (live, 3 lenses)`);
  const { json: design, headerSource } = await postJson("/api/design", {
    goal: GOAL,
    constraints: CONSTRAINTS,
    pack: ctx.decisionContextPack,
  });
  const candidates = design.candidates ?? [];
  console.log(`  overall x-keystone-source=${headerSource}; ${candidates.length} candidates`);
  for (const c of candidates) {
    console.log(`   · ${c.lens.padEnd(12)} [${c.source}] "${c.label}"  ${c.graph.nodes.length} nodes, ${c.attacks.length} attacks`);
  }

  const artifact = {
    meta: {
      generatedFrom: BASE_URL,
      goal: GOAL,
      constraints: CONSTRAINTS,
      contextSource: ctx.source,
      designSource: headerSource,
      perCandidateSource: candidates.map((c) => ({ lens: c.lens, source: c.source })),
    },
    goal: GOAL,
    constraints: CONSTRAINTS,
    decisionContextPack: ctx.decisionContextPack,
    candidates,
  };
  writeFileSync(OUT, JSON.stringify(artifact, null, 2));

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`DESIGN SCENARIO R — LIVE GENERATION SUMMARY`);
  console.log(`  context source:  ${ctx.source}`);
  console.log(`  design source:   ${headerSource}`);
  console.log(`  candidates:      ${candidates.map((c) => `${c.lens}:${c.source}`).join(" ")}`);
  console.log(`  artifact:        ${OUT}`);
  const allLive = headerSource === "live" && candidates.every((c) => c.source === "live");
  console.log(allLive ? `\n✓ ALL 3 CANDIDATES LIVE.` : `\n⚠ SOME CANDIDATES FIXTURED — see per-candidate provenance above.`);
}

main().catch((err) => {
  console.error(`✗ ${err.stack || err.message}`);
  console.error("  Is the dev server running with a key? Try: npm run dev");
  process.exit(1);
});
