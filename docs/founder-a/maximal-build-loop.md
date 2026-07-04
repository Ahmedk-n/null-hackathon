# Founder A Maximal Build Loop Report

Independent multi-agent verify-and-build loop over the Founder A workstream. Prior reports were treated as
claims and re-verified from source, commands, an independent math recomputation, **and a live API run**.

## Executive Verdict

**MAXIMAL.** An independent 11-agent build-loop (verify → build → re-verify) found **zero P0/P1 defects**.
The loop **built 4 new pure engine helpers + full attack validation + a live smoke test + a technical-claims
doc**, then a second independent agent pass over the built result surfaced only **8 doc-sync / test-coverage
nits (all P2–P4, all in scope)** — **all 8 applied**. The consolidation additionally *corrected two false
raw findings* (reweighting is an intentional client contract; `keystoneAfterLoad` correctly stays
`k_credible`). Final gates: **112 tests pass + 1 skipped live-smoke, typecheck 0, build 0**, and the live
Claude path was verified end-to-end. Merge: **MERGE**. Founder B: **READY** (contracts now fully in sync).

## Branch and Repo State

- **Current branch:** `founder-a/context-core` — clean working tree, in sync with `origin`.
- **Remote branches inspected this session** (`git fetch --all --prune` + `git branch -a`): `origin/main`,
  `origin/founder-a/context-core`, `origin/HEAD→main`. **No Founder B branch found on the remote during
  this session.** No integration branch found.
- `founder-a/context-core` is a strict superset of `main` (built on top of `51fa151`); `main` has zero
  commits not already in this branch.
- **SDK deviation re-verified:** `@anthropic-ai/sdk@0.68.0` — `messages.parse`, `beta.messages.parse`, and
  `@anthropic-ai/sdk/helpers/zod` are all **still absent**. The forced-tool-use + zod-validation approach
  remains correct and necessary.

## Commands Run

| Command | Result |
|---|---|
| `git fetch --all --prune` / `git branch -a` | only `main` + `founder-a/context-core` remotes; no Founder B branch |
| `npx vitest run` | **112 passed, 1 skipped** (live-smoke), exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 (real `/` route) |
| `npm run lint` | **not configured** (documented; `tsc --noEmit` is the static gate) |
| `npm run smoke:llm` (with key, ephemeral) | **1 passed in 60.6s** — live `claude-opus-4-8`, forced tool use, compile→extract→attacks all schema-valid |
| independent math script (from-scratch propagator) | baseline 61.9650, keystone k_credible 17×, post-load 1.4321, failures `{T,c_exec,c_reliab,k_credible}`, c_roi holds |
| grep for the Anthropic key prefix across the repo | **no key string anywhere in repo** |

### Live API verification (key handled safely)
The provided key was written only to a temp file **outside the git repo**, passed via an ephemeral env var,
and **deleted immediately** after use. It was never printed, committed, or written into any tracked file
(verified by grep). A metadata-only ping confirmed key validity + `claude-opus-4-8` access
(`stop_reason=end_turn`); the full `smoke:llm` test then exercised the real forced-tool-use pipeline and
passed in 60.6s (real latency ⇒ the live path genuinely executed, not a fixture fallback).

## Agent sections (independent 11-agent pass over the built state)

| Agent / area | Verdict | Raw findings | Disposition |
|---|---|---|---|
| 1. Repo & Branch Scout (orchestrator direct) | PASS | — | branch clean/pushed; no Founder B branch this session; SDK deviation still valid |
| 2. Contract Compliance | PASS_WITH_CONCERNS | 3 | `contracts.md` lagged new exports → **fixed** |
| 3. Deterministic Engine Deep Review | **PASS** | 0 | `explain.ts` group values verified to match `computeSupport`; no drift; math re-derived |
| 4. Context Schema | PASS_WITH_CONCERNS | 4 | negative-coverage nits → **tests added** |
| 5. Fixture & Demo Math | **PASS** | 0 | hero graph independently recomputed; all six targets reproduced |
| 6. LLM Live-Path & Fallback | **PASS** | 0 | no-throw, retry-once, zod-validated, key server-only, forced-tool-use correct; live-verified |
| 7. Context Weighting | **PASS** | 0 | pure, client-safe, correct maps, no substring-collision |
| 8. Security & Boundary | **PASS** | 0 | SDK+key confined to `structured.ts`; barrel excludes `compile`; no key committed |
| 9. Test Quality | PASS_WITH_CONCERNS | 6 | coverage nits (empty graph, sole-load-bearing, keystoneAfterLoad, type-mismatch) → **added** |
| 10. Build & Tooling | **PASS** | 0 | scripts real (+`verify`,`smoke:llm`); strict TS; `.gitignore` sound |
| 11. Founder B Readiness | PASS_WITH_CONCERNS | 1 | `contracts.md` drift → **fixed**; all contracts resolve |
| 12. Wow-Factor / Complexity | PASS_WITH_CONCERNS | 3 | the built helpers *were* the improvements; residual are optional |

## Orchestrator Synthesis

**Overall verdict: MAXIMAL** (consolidation rated NEAR-MAXIMAL *before* the 8 nits were applied).

**Consolidated findings: 8, zero P0/P1** — all applied:
| ID | Pri | File | Fix applied |
|---|---|---|---|
| F1 | P2 | `contracts.md` | Added `validateAttacks` + 3 explain helpers + 7 interfaces to the `@/engine` contract |
| F2 | P3 | `explain.test.ts` | Sole-load-bearing keystone test (`impactRatio === Infinity`, explanation branch) |
| F3 | P3 | `explain.test.ts` | Assert `keystoneAfterLoad === "k_credible"` (corrected: it does NOT become null) |
| F4 | P3 | `explain.test.ts` | `supportBreakdown` empty-graph degradation test |
| F5 | P3 | `schemas.test.ts` | Wrong-type negative + `postClamp` NaN→0 / Infinity→1 |
| F6 | P3 | `validate.ts` | Non-assumption message states design intent |
| F7 | P4 | `types.ts` | Header wording: "arrays are required (never optional)" |
| F8 | P4 | `technical-claims.md` | Clarified reweighting is a client-side (Founder B) contract, not an LLM step |

**Corrected false findings (dropped by consolidation):** (a) "reweightAttacksByContext is unwired" — it is an
*intentional* client-side contract; wiring it into `generateAttacks` would contradict the architecture. (b)
"`keystoneAfterLoad` should be null/different" — verified false; `k_credible` (impact 1.432) remains the most
load-bearing node post-collapse.

**Defects found:** none (0 P0, 0 P1). Everything surviving was P2–P4 documentation/coverage.

## Fixes Built
Improvements built this loop (all pure TypeScript, Founder A scope, tested):
- **`supportBreakdown(graph)`** (`engine/explain.ts`) — per-node own-confidence, group contributions (AND
  product / OR max), dependency factor, support, failed flag. Data contract for Founder B "why" panels.
- **`explainKeystone(graph)`** — baseline, keystone id/impact, next impact, impact ratio, ranked
  assumptions, and a deterministic number-derived sentence (not model prose).
- **`summariseLoadResult(graph, attacks, threshold?)`** — baseline vs post-load integrity, drop,
  failed/holding node ids, keystone before/after. Clean data contract for the collapse panel.
- **`validateAttacks(graph, attacks)`** (`engine/validate.ts`) — enforces every attack targets an existing
  **assumption**, unique id, finite severity, non-empty rationale; wired into `generateAttacks` so malformed
  live attacks fall back to fixtures ("code decides").
- **`live-smoke.test.ts`** — skipped unless `ANTHROPIC_API_KEY`; asserts shape only; verified live.
- **`npm run verify` / `npm run smoke:llm`** scripts; **`docs/founder-a/technical-claims.md`**.
- Boundary scan scoped to engine **source** (test harnesses may import fixtures) — guarantee unchanged.

## Improvements Built
(see Fixes Built) — 4 pure engine helpers + full attack validator + 1 doc, **+18 tests (94→112)** plus the
gated live-smoke test, then +8 consolidated nit-fixes (doc-sync + coverage). Live path verified against the
real API.

## Improvements Deferred
None outstanding in Founder A scope — all 8 consolidated findings (P2–P4) were applied. Deliberately NOT
done (out of scope / would harm architecture):
- Wiring `reweightAttacksByContext` into `generateAttacks` — it is a **client-side** contract for Founder B
  by design (keeps the LLM wrapper free of context-weighting; the store applies it before the engine).
- `import "server-only"` guards — would risk breaking the vitest (node) run; the static boundary tests
  (`engine/boundary.test.ts`, `context/boundary.test.ts`) already enforce key/SDK isolation.
- Any UI/store/API/canvas work (Founder B scope).

## Remaining Risks
1. Live path now verified once against the real API; still not part of the keyless CI suite (by design — the
   offline fixture path is the demo default and is fully tested).
2. `next build` npm-audit advisory on transitive dev deps — cosmetic.
3. No Founder B branch exists yet to integration-test against; `contracts.md` + `technical-claims.md` are the
   integration surface.

## Final Founder A Verdict

**MAXIMAL — MERGE.** The Founder A side is a complete, correct, robust, demo-safe, and pitch-credible
deterministic system: a pure solver + graph/attack validation + explainability data contracts + zod-gated
LLM wrappers with fixture fallback, all boundary-enforced and now **live-verified** against
`claude-opus-4-8`. 112 tests pass (+1 gated live-smoke), typecheck and build clean, no API key anywhere in
the repo. Founder B readiness: **READY** — every documented contract resolves against a typed export, and
`contracts.md` + `technical-claims.md` are in sync with the source.

## Founder B Integration Notes
- Client-safe imports: everything in `@/engine` (pure) and `@/context` **except** `compile.ts`;
  `reweightAttacksByContext` is pure/client-safe.
- Server-only: `@/context/compile` (`compileContext`), `@/llm/client`, `@/llm/reinforce`, `@/llm/structured`
  — import only inside `src/app/api/**` route handlers.
- New data contracts for UI: `summariseLoadResult`, `explainKeystone`, `supportBreakdown` (all pure).
- Pass `DecisionContextPack` into `extractStructure`/`generateAttacks`; build `ContextRouteResponse` (add
  `source`) in the `/api/context` route.
