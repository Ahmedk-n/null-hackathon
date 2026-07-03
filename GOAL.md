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

## Reference docs

- Base build plan: `docs/superpowers/plans/2026-07-03-keystone.md` (Tasks 1–14, exact code)
- Context-layer plan: `docs/superpowers/plans/2026-07-03-keystone-context-layer.md` (§4 contracts, §6 prompts, §8 dimensionality, §9 boundary, §10 split, §13 fixtures)
- Design spec: `docs/superpowers/specs/2026-07-03-keystone-design.md`
