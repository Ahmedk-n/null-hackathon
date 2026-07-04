# Keystone v6 — execution plan (DESIGN · TEST · ASSEMBLE)

**Spec:** `docs/superpowers/specs/2026-07-04-keystone-v6-design.md` (approved). **Drives:** the agent /loop.
**Priority:** V6-1 Generative > V6-2 Tunnel > V6-3 Skyline; V6-4 landing/explanations never cut.
**Exit:** all items [x] · vitest 100% · tsc clean · NEXT_DIST_DIR=.next-gate build 0 · npm run e2e PASS (with new legs).

## Wave 1 (parallel; the founder-a harvest agent owns src/engine/explain*, engine/boundary.test, llm/reinforce, api/reinforce, StressTab VALIDATE-BY, docs/founder-a until it lands)

### V6-1 · Generative Decision Design
- [ ] Extract `src/ui/MiniStructure.tsx` from the landing hero (landing hero consumes it; no visual regression).
- [ ] `src/llm/design.ts` + `POST /api/design` (3 lenses parallel, wall-validated, per-candidate fixture stand-ins, x-keystone-source, scenario/no-key → pinned).
- [ ] `scripts/generate-design-r.mjs` run once live → `fixtureDesignCandidatesR` pinned (provenance verbatim; calibrations documented).
- [ ] `src/ui/tabs/DesignTab.tsx`: GOAL/CONSTRAINTS + explainer + GENERATE RIVALS + tournament (3 MiniStructures, simultaneous grounded collapse, client-side pure verdicts, survivor stamp) + OPEN IN STUDIO (seeds store + library, jumps to GRAPH).
- [ ] KeystoneApp: tabs 0·DESIGN → 1·CONTEXT → 2·GRAPH → 3·STRESS; retarget T9 shell test to 4 tabs (deliberate, note in deviations). SKYLINE TopBar link (owns KeystoneApp this wave).
- [ ] Tests: design fixtures pinned verdicts, route short-circuits, DesignTab render + tournament stamps, MiniStructure extraction (landing test stays green).
- Files: src/ui/MiniStructure.tsx, src/landing/MiniCollapseHero.tsx, src/ui/tabs/DesignTab.tsx, src/llm/design.ts, src/app/api/design/route.ts, src/context/fixtures.ts (candidates), scripts/, src/app/KeystoneApp.tsx, shell.test, e2e (DESIGN leg).

### V6-3 · Skyline ✅ (pure skyline.ts: token-Jaccard ≥0.5 union-find matcher, crackFoundation knockout, tolerant; /skyline SVG towers + foundation columns + CRACK readout + RESET; SAMPLE-seeded, one aliased shared foundation R+A → both collapse "1 ASSUMPTION FEEDS 2 STRUCTURES · 2 COLLAPSE"; 22 tests; e2e leg delivered as e2e/skyline-leg.mjs for orchestrator splice)
- [x] `src/lib/skyline.ts` (pure): buildSkyline + token-Jaccard shared-foundation matcher (≥0.5) + crackFoundation (engine knockout per member). Thorough unit tests.
- [x] `/skyline` page: SVG skyline, buildings, foundation columns, CRACK IT → drop/dim + readout, RESET. SAMPLE-seeded when library empty. Header explainer line.
- [x] e2e SKYLINE leg delivered as standalone runSkylineLeg snippet — orchestrator splices after V6-1's rehearsal edits.
- Files: src/lib/skyline.ts (+test), src/app/skyline/page.tsx, src/ui/skyline/** (new), e2e (own leg — coordinate: V6-1 owns e2e this wave, so V6-3 WRITES its leg as a separate exported block appended after V6-1 lands OR hands the leg spec to the orchestrator; simplest: V6-3 delivers the leg as e2e/skyline-leg.snippet.mjs and the orchestrator splices) — DEVIATION allowed: orchestrator wires e2e.
- Do NOT touch KeystoneApp (V6-1 owns it; the TopBar link is V6-1's).

### V6-4 · Landing + explanation layer ✅ (HOW IT WORKS → DESIGN·TEST·ASSEMBLE; 5 new vocab terms verbatim, ordered basics-first; VIEW SKYLINE CTA; README arc + 90s demo script; Landing.test asserts all)
- [x] HOW IT WORKS rewritten to DESIGN → TEST → ASSEMBLE; vocabulary ledger gains the 5 new terms (spec definitions verbatim); VIEW SKYLINE link; README arc update.
- [x] Microcopy sweep: landing explainer strings delivered; per-surface explainers are each owning-agent's contract (DesignTab/Tunnel/Skyline).
- Files: src/landing/Landing.tsx (+test), README.md. Not MiniCollapseHero (V6-1 owns it).

## Wave 2 (after Wave 1 + harvest land)

### V6-2 · Adversarial Wind Tunnel
- [ ] `src/context/tunnel.ts` (pure referee): applyTunnelRound validation table (target exists/assumption, category normalises, severity ≤0.6, no duplicate targets, restore ≤ baseline, rebuttal ≥ 0.5× severity) + engine recompute on a session clone. Unit-tested exhaustively.
- [ ] `src/agents/tunnel.ts`: prosecutor + advocate on the proven live pattern (30s timeouts, retryOnce, transcript-threaded prompts); scripted 5-round fixture duel for scenario R; mid-duel agent failure → scripted continuation event.
- [ ] `POST /api/tunnel` SSE (gather-shaped events: round/proposal/verdict/counter/done).
- [ ] STRESS tab WIND TUNNEL section (enabled loadApplied && grounded): session-clone MiniStructure + role-tagged transcript ledger + live session integrity + final stamp + explainer. Main verdict untouched.
- [ ] Tests: referee table, fixture duel replay end-state pinned, route SSE shape, UI render. e2e TUNNEL-replay leg.
- Files: src/context/tunnel.ts (+test), src/agents/tunnel.ts (+test), src/app/api/tunnel/route.ts (+test), src/ui/tabs/StressTab.tsx (harvest has landed by now), e2e.

### V6-5 · Final sweep
- [ ] Full gates + e2e all legs; GOAL.md v6 gates section; memory update; judge-lens sanity pass on the 90s demo arc (design→tunnel→skyline).

## Loop protocol
As v5: agents implement (no commits), orchestrator runs full gates and commits per item, ticks boxes, appends deviations. Concurrency by the file-ownership groups above; harvest agent's files are off-limits until its commit lands.

## Deviations
(append here)
