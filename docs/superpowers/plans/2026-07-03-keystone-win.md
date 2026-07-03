# Keystone — Win Plan (critique synthesis → ranked work)

**Set:** 2026-07-03, evening. **Drives:** the agent /loop. **Exit:** all Wave 0–2 items `[x]` AND all GOAL.md machine gates green.
**Sources:** three independent Opus critiques — design-vs-spec, hackathon-judge simulation, gate/guardrail audit. All claims below were verified against code or the running app.

## Where we stand (verified)

- Gates: T1 ✅ 94/94 tests · T2 ✅ tsc clean · T3 ✅ build exit 0 · T5/T6 ✅ offline chain 200s, schema-valid, 9-node `k_credible` · T7/T8/T9/T10 ✅ (audited with file:line evidence).
- Judge-sim scorecard **today**: Coolness **7/10** · Technical Complexity **8/10** · Creativity **8/10**.
- Engine verified real & deterministic: baseline 62.0% → post-load 0–1.4%, keystone impact ~60pts vs ~2pts next. `c_roi` holds.

## The three findings that decide the hackathon

1. **The differentiator is invisible (demo-blocking).** With OR without the "enterprise meeting tomorrow" context, the structure collapses to ~0–1% with the identical failure set. Context reweighting only changes decimals in a side ledger. A judge asking *"what did the context actually change?"* gets nothing. → W0-1.
2. **The aesthetic is fake at the font level.** `theme.css` names Inter + JetBrains Mono; nothing loads them. Every "mono tabular numeral" renders in system fallback. → W0-2.
3. **Live mode can freeze.** No timeout on any agent LLM call (SDK default ~10 min); no AbortController client-side. One slow `web_search` during a live gather = frozen CONTEXT tab. → W0-3.

---

## Wave 0 — Demo-blockers (do first, sequential-safe)

### W0-1 · Make context flip the OUTCOME ⟵ the single highest-leverage change
- [x] Retune `src/context/fixtures.ts` attack severities. **DEVIATION (verified impossible as specced):** raw 35–45% with zero failures cannot coexist with pinned reweighted <10% — the keystone enters the integrity product *squared* (feeds c_exec AND c_reliab), so raw k must sit ≈0.50 for a ×1.5 reweight to flip it, capping raw integrity ≈20%. Delivered the achievable beat: **raw → k_credible 0.513 HOLDS, all claims hold, integrity 17.1% (only T stressed); reweighted → atk 0.43→0.645, k_credible 0.320 FAILS, integrity 6.4%, cascade {T,c_exec,c_reliab,k_credible}, c_roi holds.** Math documented in fixtures.ts.
- [x] Pinned assertions kept green (baseline 61.97, dominance 17×, post-load <10, c_roi holds) + NEW pins: raw ∈ (15,25), keystone holds raw, keystone fails reweighted.
- [x] **A/B toggle in STRESS tab**: `IGNORE CONTEXT ⟷ GROUND IN CONTEXT` segmented control; store keeps `rawAttacks` + `setApplyContextWeights` re-derives live from clean baseline. Toggle tests added.
- [x] Guardrails held: `src/llm/fixture.ts` untouched; engine untouched.
- Files: `src/context/fixtures.ts`, `src/context/weights.ts` (K=0.5), `src/context/fixtures.test.ts`, `src/ui/tabs/StressTab.tsx`, `src/store/**`.

### W0-2 · Load the real fonts (30 min, highest ROI/hour)
- [x] `src/app/layout.tsx`: `next/font/google` — Inter + JetBrains Mono as CSS variables on `<html>`; point `--sans`/`--mono` (`src/ui/theme.css:27-28`) at them. Verify tabular numerals render. *(Done: next/font/google, subsets latin, display swap; tsc clean, shell tests green, isolated build compiled.)*

### W0-3 · Timeout every live LLM path
- [x] Pass `{ timeout: 30_000 }` (SDK option) or `Promise.race` → existing `catch → fallback` in `src/agents/business.ts:56`, `temporal.ts:38`, `technical.ts:243` (tool-runner: also cap total via `max_iterations` already present + outer race). *(Done: per-request timeout 30s on business/temporal, client-level 30s + 90s Promise.race on toolRunner.)*
- [x] Client deadline: `AbortController` + ~75s cap in `src/lib/useAgentStream.ts` so `running` can never spin forever. *(Done: abort + terminal error event, clearTimeout in finally, no Date.now.)*
- [x] While here, honor the "retry once then fixture" guardrail (single retry wrapper). *(Done: src/agents/retry.ts retryOnce with SDK maxRetries:0 on business/temporal; toolRunner uses SDK maxRetries:1 — intentional, runner is stateful.)*

### W0-4 · Truthful SOURCE labeling (credibility with judges)
- [x] `/api/context` now reports `"fixture"` truthfully (compile.ts confirmed stub); route test proves label independent of key presence.
- [x] Chips: `⚠ demo fallback` → `LIVE` (--ok) / `CACHED` (neutral) SourceChip in ContextUsedPanel + AgentGather; StatusStrip maps the same vocabulary. testids: context-source-chip, gather-source-chip.

## Wave 1 — The money shot (collapse spectacle; parallelizable after W0)

### W1-1 · Gauge craters instead of snapping
- [x] `src/ui/IntegrityGauge.tsx`: useMotionValue count-down + ring + color all synced at 0.9s ease `[0.22,1,0.36,1]`; once-per-crossing shake into FAILED; status word HOLDING/STRESSED/FAILED (bands unified at ≥35/10–35/<10 to match the narrative — deviation noted, nothing asserted old thresholds). 4 new tests.

### W1-2 · Ripple collapse, not tiered thuds
- [x] Exported pure `collapseDelayFor` — keystone 0 (fails first), else `layer*0.18 + indexInLayer*0.06`; accelerating masonry fall `[0.7,0,0.84,0]` 0.55s. 4 unit tests.

### W1-3 · Cracks that propagate + debris
- [x] motion.polyline strokeDashoffset 1→0 self-drawing cracks (0.3s, 0.1s stagger, offset by node collapseDelay); 6 deterministic KEYSTONE_SHARDS debris (precomputed angle table, no Math.random).

### W1-4 · Camera shake + push-in on Apply Load
- [x] Shake wrapper OUTSIDE data-canvas-tilt (T10 transform untouched): x/rotateZ keyframes 0.4s on empty→non-empty failure edge; perspective 1400→1200→1400 push, rest value preserved for T10.

### W1-5 · Causal callout on the crack
- [x] `keystoneCalloutFor` (pure, exported): matches keystone attack raw vs effective severity + strongest category adjustment → blueprint tag "CRACKED / EXECUTION SEVERITY 0.43→0.65 / <real reason>"; neutral THRESHOLD CROSSED in raw mode; fades in 0.5s after crack. Wired through GraphTab AND StressTab (orchestrator added StressTab props).

### W1-6 · Assembly build-in + force arrows
- [x] Entrance animation staggered bottom-up (`buildDelayFor = layer*0.12 + idx*0.05`), once per base-graph identity via WeakSet; KeystoneApp reveal timer intentionally kept (sequencing beat, noted deviation).
- [x] 3 deterministic red force arrows (self-drawing shafts, slide-down, LOAD label) over thesis on Apply Load; vanish on reset.

### W1-7 · Keystone tension telegraph
- [x] KeystoneGlow overlay: breathing 1.2s pulse while `loadApplied && !isFailed`, 30px flare 0.25s at failure, calm rim otherwise; `loadApplied` threaded through node data and passed from StressTab (orchestrator wired the call site).

## Wave 2 — Sell complexity + rigor

- [x] **W2-1 Sensitivity bars:** KNOCK-OUT SENSITIVITY ledger in STRESS rail — rankLoadBearing on clean baseGraph, keystone row --bad accented, hairline bars, tabular numerals.
- [x] **W2-2 Deterministic re-run beat:** RE-RUN ANALYSIS button re-executes pipeline from stored raw inputs, compares verdict, flashes "IDENTICAL ✓ DETERMINISTIC" chip (~2s); DRIFT DETECTED fallback. Store additions additive only.
- [x] **W2-3 Second scenario that HOLDS:** Scenario B "Reinforce First" (7-node simple-2d, keystone k_sre): baseline 69.0%, raw 49.2%, reweighted 47.6%, zero failures — same context that craters A barely stresses B. SCENARIO segmented control in ContextTab; scenario threads through context→extract→attacks; default stays hero A (T6 pinned). Pinned tests added; 136 total green.
- [x] **W2-4 One truly-live axis in demo:** _20260209 ids ACCEPTED by API but latency-unbounded (53–275s → dead-by-timeout → silent fixture). Switched to web_search_20250305/web_fetch_20250910 + max_uses caps + 60s timeout → live business gather reliable ~35s. smoke-live business PASS source:live, 10 real facts. Probe kept at scripts/probe-server-tools.mjs.

## Wave 3 — Chrome polish (cheap, batch into one agent)

- [ ] W3-1 CAD grid: `Background variant=Lines` gap 26 + coarse 130 (`KeystoneCanvas.tsx:121`).
- [ ] W3-2 Status strip: add `LINKS n` + `MODE layered-2-5d` (from `pickLayoutMode`) per plan §2 mock (`KeystoneApp.tsx:90-109`).
- [ ] W3-3 Centered empty states with wireframe keystone placeholder (`GraphTab.tsx:83`, `StressTab.tsx:128`).
- [ ] W3-4 Tilt vs React Flow pointers: `panOnDrag={!tilt}` `nodesDraggable={!tilt}` (or transform `.react-flow__viewport` only).
- [ ] W3-5 Band-1 flat mode actually flat (perspective off ≤8 nodes) — wire `pickLayoutMode` to geometry.
- [ ] W3-6 Tokenize `#f6ecea` failed-node bg; W3-7 `extractFindings` enforce ≥5 facts (T11); W3-8 add `@/context`/`@/agents` barrels to boundary FORBIDDEN lists (audit R5).

---

## Loop protocol (how agents execute this)

1. Work on branch `founder-b/context-ui`, direct commits, one commit per plan item (`W0-1: …`).
2. **Gates before every commit:** `npx vitest run` (all pass) · `npx tsc --noEmit` · `NEXT_DIST_DIR=.next-gate npx next build` (NEVER plain `next build` — clobbers dev servers).
3. Live smoke: dev server on **:3002** (`NEXT_DIST_DIR=.next-agent npx next dev -p 3002`); chain probe context→extract→attacks must 200.
4. Never violate GOAL.md guardrails: model id `claude-opus-4-8`; engine purity; `src/llm/fixture.ts` frozen; offline-first (no key → full demo works).
5. After each item: tick its `- [x]` box here, note deviations under the item.
6. Concurrency: W0 items sequential (shared files); W1 items may fan out AFTER W0-1 lands (they touch canvas/gauge/node files — pairwise-distinct, but W1-2/W1-3/W1-7 all touch `StructuralNode.tsx` → one agent for those three).

## Deviations / notes

(append here)
