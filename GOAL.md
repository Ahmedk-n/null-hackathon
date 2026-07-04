# GOAL — Keystone (Founder B)

**Owner POV:** Founder B — "Product & Integration" (per context-layer plan §10).
**Set:** 2026-07-03. **Loop until:** every success criterion below is green.

## North star

Win the hackathon with **Keystone**: a CAD tool for startup/tech decisions that grounds
every decision in the company's **business, technical, and temporal context** — including
**upcoming meetings** (e.g. an enterprise customer call tomorrow) — then lets you tune
assumptions parametrically and **stress-test** them until the single load-bearing
assumption cracks. Maximize the three judging axes from Founder B's product POV:

- **Coolness** — the live collapse: Context Used reasoning fades in, the structure
  assembles, "Apply Load" craters the integrity gauge and shatters the keystone.
- **Technical Complexity** — a real deterministic solver (support propagation +
  knock-out sensitivity + failure detection) that the LLM never overrides; context
  influences it only through prompt grounding + one pure `reweightAttacksByContext`.
- **Creativity** — decisions grounded in *business + meetings*, not just tech. Nobody
  has built context-grounded structural analysis for founder decisions.

## What "context-grounded" means (the new dimension Founder B asked for)

Decisions ingest four inputs (business, technical, temporal, decision). One Claude call
compiles a `CompanyContext` + a `DecisionContextPack`; the pack's `contextWeightAdjustments`
shift attack severities by category (e.g. a meeting tomorrow → ▲ execution/reliability/
timeline/auditability). Meetings and deadlines are first-class (`UpcomingEvent`, `Deadline`).

## Success criteria (the loop exits when ALL are green)

1. `npm test` passes: engine determinism; context schema/clamp/reweight; engine-purity
   and client/key-safety boundary guards; route integration with `pack`; the pinned
   context-hero fixture (baseline ≈62%, keystone `k_credible` strictly dominant, post-load
   <10%, `c_roi` holds).
2. `npm run build` succeeds; `npx tsc --noEmit` clean.
3. **Offline demo works with no `ANTHROPIC_API_KEY`** (fixture fallback) — the whole
   `/context → /extract → /attacks` chain returns valid data and never 500s.
4. End-to-end hero flow (§13): pre-filled inputs → **Analyse** → Context Used renders
   (business/technical/**temporal** facts + weight rows referencing tomorrow's meeting) →
   graph assembles → **Apply Load** → gauge craters (engine-computed) → keystone
   `k_credible` red-glows and cracks → `c_roi` holds (partial collapse).
5. Adaptive dimensionality **Band 2** (layered 2.5D, staggered bottom-up collapse) on the
   9-node context-hero graph.
6. Key-safety holds: no `"use client"` / `src/store/**` file imports the SDK or reads
   `ANTHROPIC_API_KEY`; the client reaches the model only via `fetch` to `/api/*`.

## Guardrails (never violate)

- Model id exactly `claude-opus-4-8`; structured output via `messages.parse` + `zodOutputFormat`;
  no prefill, no `budget_tokens`; every LLM call retries once then falls back to a fixture.
- `src/engine/**` stays pure (no context/llm/react/next imports; never receives a pack).
- Do NOT retune `src/llm/fixture.ts` (base `a_arch` tests must stay green); the context hero
  is a separate `src/context/fixtures.ts::fixtureContextGraph()`.
- Non-goals (context-layer plan §15): no OpenKB/RAG, no persistence, no uploads, no auth,
  no context forms, no real Band-3 clustering unless time remains.

## v2 — Redesign goals (supersede the visual layer; logic/engine unchanged)

Full plan: `docs/superpowers/plans/2026-07-03-keystone-redesign.md`.

1. **Professional terminal/CAD-ledger UI** matching the reference (`/tmp/keystone-inspo.jpg`):
   light warm paper, 1px hairline grid, UPPERCASE tracked labels, monospace tabular
   numerals, ledger key/value rows, top action bar with ISO timestamp, bottom status
   strip, selection detail panel. Zero rounded corners. No dark toy chrome.
2. **Tabbed workflow:** CONTEXT → GRAPH → STRESS, persistent shell + contextual rail/panel.
3. **Agent-driven context aggregation** (with manual override on top):
   - Technical agent clones & explores the repo (scoped read-only tools) → tech context.
   - Business agent crawls website + competitors (web search/fetch) → business context.
   - Temporal agent parses notes/agenda → meetings & deadlines.
   - Live streamed AGENT LOG + FINDINGS ledger (source-attributed); offline via scripted fixtures.
4. **3D-feeling adaptive graph:** Band-2 perspective assembly (`translateZ` elevation per
   layer, parallax, staggered 3D collapse, TILT toggle); `pickLayoutMode` drives the band.
5. Still deterministic + offline-safe; engine decides integrity/keystone/failures; **zero
   client console errors** (hydration/loop fix stays).

### v2 testing metrics (machine gates — loop exits only when all green)

- **T1** `vitest run` 100% pass, ≥65 tests · **T2** `tsc --noEmit` 0 errors · **T3** `npm run build` exit 0
- **T5** offline `/api/gather` SSE emits `status`+`done`, findings schema-valid, `source="fixture"`, first event <2s
- **T6** full offline chain (gather→context→extract→attacks) all 200 + schema-valid + 9-node `k_credible`, integrity <10% post-load
- **T7** key-safety guard green (no client import of `@/agents/*`, `@/context/compile`, `@/llm/client`, `@anthropic-ai/sdk`, or `ANTHROPIC_API_KEY`)
- **T8** no `Math.random`/`Date.now`/`new Date(` in client files; `selectFailures` stability test green
- **T9** DOM: TopBar has ISO timestamp; exactly 3 primary tabs; ≥1 ledger row; numerals `.mono`; panel `border-radius:0px`
- **T10** 9-node graph → canvas has `perspective`, band `layered-2-5d`; TILT toggles the rotate transform

Human/rehearsal gates: T4 (0 console errors through full flow), T11 (agent findings ≥5 source-attributed facts each, with key), T12 (tab switch <100ms, smooth collapse).

## v3 — Substance layer (2026-07-04; supersedes the "fixture-only chain" state)

Full plan + status: `docs/superpowers/plans/2026-07-04-keystone-v3.md`. Delivered: live
compile/extract/attacks for judge-typed decisions (behind the scenario-pinned fixtures — the
rehearsed demo is unchanged), validation wall, minimum-reinforcement solver ("cheapest set of
assumptions to prove" — deterministic, provably minimal), confidence provenance
(GROUNDED/UNGROUNDED per assumption), and time-axis stress ("FAILS IN 8 DAYS", scrubbable).

**Guardrail amendment:** `messages.parse` + `zodOutputFormat` do not exist in the installed
`@anthropic-ai/sdk@0.68.0`; all live paths use `messages.create` + balanced-JSON extract +
zod `safeParse` + retry-once → fixture (the pattern proven live by the business agent).

## v5 — Landing + product layer (2026-07-04, from grilling; loop until all green)

Full plan + domain model: `docs/superpowers/plans/2026-07-04-keystone-v5-product.md`.
Priority (cut line): **Landing > Memo > Editing > Library.**

Success criteria (machine gates; loop exits when ALL green):
- **V5-G1** Landing at `/` (manifesto, live mini-collapse hero loop, HOW IT WORKS, vocabulary
  ledger, honest-architecture panel, ENTER STUDIO); studio at `/studio`; T9 chrome contract
  holds on /studio; e2e retargeted and passing.
- **V5-G2** PRINT MEMO → `/studio/memo` engineering drawing sheet (title block, sensitivity
  table, de-risking plan, constraint + evidence registers) render-tested populated + empty.
- **V5-G3** Inspector-panel graph editing (rename / delete / add assumption / AND↔OR / confidence)
  with validation-wall rejection, stress-verdict reset on structural edits, MODIFIED — UNVERIFIED
  provenance; solver re-verdicts live. All action tests green.
- **V5-G4** Decision library: auto-save on Analyse (localStorage v1, cap 20), reopen/duplicate/
  delete in studio, recent-5 ledger on landing; round-trip + corruption tests green; T8
  no-client-wall-clock guard stays green.
- **V5-G5** Full gates: vitest 100%, tsc clean, NEXT_DIST_DIR=.next-gate build exit 0,
  `npm run e2e` REHEARSAL PASS (landing → studio → A/B/R legs).

## v6 — DESIGN · TEST · ASSEMBLE (2026-07-04; the creative leap)

Spec `docs/superpowers/specs/2026-07-04-keystone-v6-design.md`, plan `…/plans/2026-07-04-keystone-v6-plan.md`.
Keystone becomes the full CAD loop for thinking. All items green (442 tests, e2e legs DESIGN + TUNNEL + SKYLINE):
- **DESIGN** (tab 0): state a GOAL + CONSTRAINTS → three RIVAL structures (AGGRESSIVE / CONSERVATIVE /
  HYBRID lenses) synthesized in parallel and stress-tested under IDENTICAL grounded load; the pure
  solver ranks them; the survivor opens in studio. Generative design for thinking. `/api/design`.
- **TEST**: grounded load + the **WIND TUNNEL** — a PROSECUTOR agent attacks, an ADVOCATE counters
  with evidence, the deterministic solver referees every round and cannot be overridden (`/api/tunnel`,
  runs on a session clone; keyless → scripted deterministic duel).
- **ASSEMBLE**: `/skyline` renders the whole library as one structure; assumptions shared across
  decisions become **shared foundations** — crack one, watch systemic collapse ripple across buildings.
- Landing rewritten to the DESIGN·TEST·ASSEMBLE arc with full vocabulary; founder-a's explain/purity-
  guard/reinforce harvested (merge-disposition in docs/founder-a/contracts.md).

## v7 — Substance pass (2026-07-04; depth, stress value, real bug fixes)

Plan `docs/superpowers/plans/2026-07-04-keystone-v7-depth.md`. Answered founder feedback that the
project had been over-indexed on visualization while graphs stayed shallow, stress thin, agents
shallow, and UI bugs (crack-readout overflow) unfixed.
- **Depth math:** product-AND collapsed depth to ~0 integrity. New TYPE-AWARE AND aggregation
  (`propagation.ts`) — geometric mean over corroborating leaf-assumptions (depth-robust) / product
  with any internal child (keystone still craters). Fixtures rebuilt DEEP: A 13-node/5-layer,
  R 13/5, B 9/4, with sub-assumptions + evidence-support nodes. All beats re-pinned.
- **Stress value:** STRESS now surfaces the engine's reasoning (was one number + bars) — attack
  rationale, before→after + ordered failure cascade, keystone dominance ratio, support breakdown,
  and new pure `marginalReinforcement` (+N% firm-up) / `failureCascade`.
- **Agent depth:** `renderPack` feeds the full pack (constraints/objectives/risks/missing-info);
  node evidence single→array (supporting + contradicting); GatherFinding gains detail + quantified
  specifics; gather loops deepened.
- **UI:** `.ledger-row` overflow fixed at the source (crack readout + SelectionPanel + canvas labels).

## Reference docs

- Base build plan: `docs/superpowers/plans/2026-07-03-keystone.md` (Tasks 1–14, exact code)
- Context-layer plan: `docs/superpowers/plans/2026-07-03-keystone-context-layer.md` (§4 contracts, §6 prompts, §8 dimensionality, §9 boundary, §10 split, §13 fixtures)
- Design spec: `docs/superpowers/specs/2026-07-03-keystone-design.md`
