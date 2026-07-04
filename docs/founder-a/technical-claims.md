# Keystone — Deterministic Technical Claims (Founder A)

Every claim here is **backed by a passing unit test** and is computed by pure TypeScript in
`src/engine/**` — never by the LLM. This is the core pitch: **the LLM proposes, deterministic code
decides, and the code can show its work.**

## The boundary: LLM proposes, code decides

| The LLM may propose | Deterministic code decides (engine) |
|---|---|
| graph structure, claims, assumptions | support propagation (`computeSupport`) |
| initial confidences | structural integrity (`integrity`) |
| attacks + severities | attack application (`applyAttacks`) |
| reinforcement suggestions | failure detection (`detectFailures`) |
| | knock-out sensitivity + keystone (`rankLoadBearing` / `keystone`) |

Enforced in code: `src/engine/**` imports nothing from `@/llm` or `@/context` (guard:
`engine/boundary.test.ts`); the LLM wrappers only return *proposals*, which are validated
(`graphReferenceIssues`, `validateAttacks`) before the engine computes anything.

## Formulas (pure, deterministic)

**Support propagation** — for a node `n` with own confidence `c(n)` and dependency groups `G`:
```
support(n) = clamp01( c(n) × Π_{g ∈ G} aggregate(g) )
aggregate(AND group) = Π support(child)      // product — every leg must hold
aggregate(OR group)  = max support(child)     // any one suffices
leaf (no groups): support(n) = clamp01(c(n))
```
`Structural Integrity = support(thesis) × 100`. Backed by `propagation.test.ts` (AND=0.4, multi-group=0.72, OR=0.9).

**Knock-out sensitivity** — for each assumption `a`: `impact(a) = integrity(base) − integrity(a→0)`.
Ranked desc by impact, ties broken by id asc (stable keystone). The top is the **keystone**. Backed by
`sensitivity.test.ts` + `explain.test.ts`.

**Attack application** — `c'(a) = clamp01( c(a) × (1 − clamp01(severity)) )`, compounding on shared
targets, input never mutated. Backed by `load.test.ts`.

**Failure detection** — node fails when `support(n) < threshold` (default `0.35`). Backed by `load.test.ts`.

**Context weighting** (outside the engine, still deterministic) —
`severity' = clamp01( severity × (1 + sign(direction) × 0.5 × magnitude) )`, matched by category. Pure,
no engine/LLM import. Backed by `weights.test.ts`.

## The hero fixture — pinned, independently recomputed

Decision *"Should we migrate to microservices?"* with enterprise-fintech + monolith + meeting-tomorrow
context. Graph: `T =AND(c_exec, c_reliab, c_roi)`, `c_exec =AND(k_credible)`,
`c_reliab =AND(k_credible) +OR(a_obs, a_audit)`, `c_roi =OR(a_bound, a_load)`.

| Claim | Value | Test |
|---|---|---|
| Baseline structural integrity | **61.97%** | `fixtures.test.ts`, `explain.test.ts` |
| Keystone assumption | **`k_credible`** ("Can explain safe staged migration by meeting") | `fixtures.test.ts` |
| Keystone dominance (impact ÷ next) | **17× (≥ 5×)** | `fixtures.test.ts`, `explain.test.ts` |
| Post-load integrity (after 4 attacks) | **≈ 1.4%** (< 10) | `fixtures.test.ts`, `explain.test.ts` |
| Failure set | `{T, c_exec, c_reliab, k_credible}` | `fixtures.test.ts` |
| Survives the load (partial collapse) | **`c_roi` holds** | `fixtures.test.ts`, `explain.test.ts` |

These exact numbers were reproduced by an **independent from-scratch propagator** (see
`maximal-verification.md`) and confirmed **live** against `claude-opus-4-8` (see `maximal-build-loop.md`).

## Explainability helpers (data, not prose) — for the pitch & Founder B

Pure engine functions that expose the reasoning as structured data:
- `supportBreakdown(graph)` → per-node own-confidence, group contributions, dependency factor, support, failed flag.
- `explainKeystone(graph)` → baseline, keystone id/impact, next impact, ratio, ranked assumptions, a number-derived sentence.
- `summariseLoadResult(graph, attacks)` → baseline vs post-load integrity, drop, failed/holding node ids, keystone before/after. The clean data contract for the collapse panel.

None of these ask the LLM anything — they are deterministic functions of the graph. That is the claim we can defend to judges: *we can show exactly why the structure holds and exactly why it collapses.*
