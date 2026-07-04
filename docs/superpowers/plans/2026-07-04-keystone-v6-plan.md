# Keystone v6 — execution plan (DESIGN · TEST · ASSEMBLE)

**Spec:** `docs/superpowers/specs/2026-07-04-keystone-v6-design.md` (approved). **Drives:** the agent /loop.
**Priority:** V6-1 Generative > V6-2 Tunnel > V6-3 Skyline; V6-4 landing/explanations never cut.
**Exit:** all items [x] · vitest 100% · tsc clean · NEXT_DIST_DIR=.next-gate build 0 · npm run e2e PASS (with new legs).

## Wave 1 (parallel; the founder-a harvest agent owns src/engine/explain*, engine/boundary.test, llm/reinforce, api/reinforce, StressTab VALIDATE-BY, docs/founder-a until it lands)

### V6-1 · Generative Decision Design ✅ (headline; live pipeline proven 3/3 candidates source=live, pinned authored+calibrated per R convention; tournament STANDS/STRESSED/COLLAPSED, survivor=HARDEN MANAGED INFRA FIRST 48.5% grounded; OPEN IN STUDIO seeds+saves+jumps; 4-tab T9 retarget; 418 tests, e2e DESIGN+SKYLINE legs PASS)
- [x] Extract `src/ui/MiniStructure.tsx` from the landing hero (hero consumes it, no regression).
- [x] `src/llm/design.ts` + `POST /api/design` (3 lenses parallel, wall-validated, per-candidate stand-ins, x-keystone-source, scenario/no-key → pinned).
- [x] `scripts/generate-design-r.mjs` run live (3/3 candidates live, captured to design-r.artifacts.json) → `fixtureDesignCandidatesR` pinned (authored+calibrated, documented).
- [x] `DesignTab.tsx`: GOAL/CONSTRAINTS + explainer + GENERATE RIVALS + tournament + OPEN IN STUDIO.
- [x] KeystoneApp: 0·DESIGN → 1·CONTEXT → 2·GRAPH → 3·STRESS (initial tab stays context); SKYLINE TopBar link; T9 retargeted to 4 tabs.
- [x] Tests + e2e DESIGN leg; orchestrator spliced the SKYLINE leg (localStorage clear so SAMPLE mode fires) — e2e PASS.
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

### V6-2 · Adversarial Wind Tunnel ✅ (pure referee validation table; live prosecutor+advocate duel + scripted R fallback ending STANDS 3/2 @ 37.90%; /api/tunnel SSE; WIND TUNNEL section on a session-clone — main verdict untouched; keyless→scripted deterministic; 442 tests, e2e TUNNEL leg 20 rows PASS)
- [x] `src/context/tunnel.ts` pure referee — full validation table (target exists/assumption, category normalises, severity ≤0.6, no dup targets, restore ≤ baseline, rebuttal ≥ 0.5× severity); recompute on session clone; input never mutated.
- [x] `src/agents/tunnel.ts` — live prosecutor+advocate (30s/retryOnce/transcript-threaded); scripted 5-round R duel; mid-duel failure → scripted-continuation notice.
- [x] `POST /api/tunnel` SSE (round/proposal/verdict/counter/done; ts stamped in route only).
- [x] STRESS WIND TUNNEL section (session-clone MiniStructure + role-tagged transcript + live integrity + stamp + explainer).
- [x] Referee table, scripted end-state pinned, route SSE, UI render tests + e2e TUNNEL leg. Deviation: keyless→scripted / key→live (StressTab has no mode prop; spec-correct, deterministic gate).
- Files: src/context/tunnel.ts (+test), src/agents/tunnel.ts (+test), src/app/api/tunnel/route.ts (+test), src/ui/tabs/StressTab.tsx (harvest has landed by now), e2e.

### V6-5 · Final sweep ✅
- [x] Full gates + e2e all legs (442 vitest · tsc clean · build 0 · REHEARSAL PASS landing→studio→A/B/R→DESIGN→SKYLINE + TUNNEL); GOAL.md v6 section added; memory updated. 90s demo arc intact: DESIGN rivals → TEST (grounded + wind tunnel) → ASSEMBLE (skyline crack).

## Loop protocol
As v5: agents implement (no commits), orchestrator runs full gates and commits per item, ticks boxes, appends deviations. Concurrency by the file-ownership groups above; harvest agent's files are off-limits until its commit lands.

## Deviations
(append here)
