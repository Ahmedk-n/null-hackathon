# Probabilistic Decision Model — Design Spec

Date: 2026-07-12
Status: Approved (design); pending user review before implementation plan
Branch: founder-b/context-ui

## 1. Problem

Keystone's current "intelligence" is thinner than it looks. The deterministic engine
(`src/engine/`) multiplies per-node confidences up an AND/OR tree (`propagation.ts:86`,
`computeSupport:100`) and ranks the keystone by knocking each node to zero
(`sensitivity.ts:35`). All actual judgment collapses into **one LLM call emitting a single
scalar confidence per assumption** (`extract`, `src/llm/client.ts:174`) and one severity per
attack (`attacks`, `client.ts:273`). Then trivial arithmetic.

Two properties make this degrade precisely as decisions get larger — the founder's core
critique ("a deterministic solver is trivial, especially as the data and work is larger"):

1. **Point estimates, no uncertainty.** `confidence: 0.9` from ironclad evidence and `0.9`
   from a hunch are indistinguishable to the engine. There is no notion of how *sure* a
   number is (`GraphNode.confidence: number`, `types.ts:30`).
2. **Independence is assumed everywhere.** Aggregation multiplies children independently
   (`propagation.ts:86-97`); the extract prompt even *requests* independent assumptions
   (`client.ts:133`). Real decisions fail in **clusters** — several assumptions that secretly
   share one driver (a vendor, an adoption bet, a rate environment). A product of independent
   probabilities badly *underestimates* correlated collapse. This shared-failure structure is
   also the "real dimensionality" the founder asked for: a hidden axis the flat graph and the
   naive product both ignore.

## 2. Goals / Non-Goals

**Goals**
- Replace "one LLM guess + multiply" with a model that reasons about **uncertainty** and
  **shared failure structure**, propagated by Monte Carlo over the *existing* engine.
- Integrity becomes a distribution (`P(hold)` + band), keystone becomes a **variance driver**,
  cascade becomes **correlated**.
- Latent drivers double as the "cognitive-module" clusters for the adaptive-dimensionality view.
- Value grows with scale; results are **reproducible** (seeded), not random.
- Cross-decision **calibration** (Phase 2) so "both" (one big decision + across many) is honest.

**Non-Goals**
- No change to the deterministic engine math. It is reused as a kernel, read-only. New fields
  are engine-inert (ignored by the pure solver, like `evidence`/`provenance` today, `types.ts:10`).
- No trained ML model / training infra. "The model" = LLM inference of structure + principled
  probabilistic sampling. (Phase 2 calibration is a small fitted logistic, not a network.)
- No full 3D/clustered-zoom rendering in Phase 1 — driver **grouping + legend** only. The
  richer zoom UI is a later, separate pass.
- No `Date.now`/`Math.random`/`new Date(` in client code (hydration safety) — seeded PRNG only.

## 3. Architecture

The engine runs today **once** on point estimates. The new brain runs it **N times** over
correlated sampled inputs. Intelligence moves out of the arithmetic into (a) what the model
infers and (b) how inputs are sampled.

```
extract (LLM) ──> Graph{nodes, groups}                     [unchanged]
   │
   ├─ emit_uncertainty (LLM, new): per assumption evidenceStrength ∈ {weak,moderate,strong}
   └─ emit_drivers    (LLM, new): latent common-mode drivers + loadings

Graph + evidenceStrength + drivers
   │
   └─> probabilisticSolve()  [NEW pure module, seeded]
          for s in 1..N:
             sample driver factors z_d ~ N(0,1)
             sample each assumption c_i (correlated via loadings)
             thesisSupport_s = computeSupport(sampled graph).thesis   ← reuses frozen engine
          aggregate → { pHold, mean, band, keystoneDrivers, keystoneAssumptions, clusters, coFailure }
```

### 3.1 New / extended data (all engine-inert)

`src/engine/types.ts` additions:
- `GraphNode.evidenceStrength?: "weak" | "moderate" | "strong"` — assumptions only. Thesis and
  claims stay pinned at confidence 1.0 and are **not** sampled (structural).
- `Driver = { id: string; label: string; loadings: { assumptionId: string; loading: number }[] }`
  where `loading ∈ [0, 1]` (magnitude of shared dependence; sign implied — a driver "failing"
  pushes loaded assumptions *down*).
- `Graph.drivers?: Driver[]` (cap ≤ 5; validated/clamped on ingest).

`ProbabilisticResult` (new):
```
{
  pHold: number;              // fraction of samples with thesis support ≥ FAILURE_THRESHOLD
  mean: number;              // mean integrity (0..100)
  band: [number, number];    // 5th / 95th percentile integrity
  samples: number;           // N used
  keystoneDrivers:   { id: string; label: string; sensitivity: number }[]; // Sobol first-order
  keystoneAssumptions:{ id: string; src: number }[];                       // std. regression coef²
  clusters: { driverId: string; assumptionIds: string[]; variance: number; loadBearing: number }[];
  coFailure: { driverId: string; assumptionIds: string[] }[]; // who falls together on a driver shock
}
```

### 3.2 The sampling model (logit-normal factor model)

Chosen over Beta+Gaussian-copula because it needs **no inverse incomplete-beta CDF** — only
`sigmoid` and seeded normals — while giving the same two knobs (marginal spread + correlation).

For each assumption `i` with point estimate `p_i` and `evidenceStrength`:
- anchor `m_i = logit(p_i)`
- spread `s_i` from strength: `strong → 0.35`, `moderate → 0.8`, `weak → 1.5` (tunable
  constants; `s → 0` recovers the point estimate exactly).
- correlated shock `x_i = Σ_d λ_{i,d} · z_d + sqrt(1 − Σ_d λ_{i,d}²) · ε_i`
  where `z_d ~ N(0,1)` per driver (shared), `ε_i ~ N(0,1)` idiosyncratic, and `Σλ²` is
  clamped ≤ 1 (communality). Assumptions loading the same driver share `z_d` → correlated.
- sampled confidence `c_i = sigmoid(m_i + s_i · x_i) ∈ (0,1)`.

Per sample, write `c_i` into the assumptions, keep thesis/claims at 1.0, call the **existing**
`computeSupport` (`propagation.ts:100`), record `integrity = thesisSupport × 100`.

**Zero-driver / zero-spread limit is a correctness anchor:** with all `λ = 0` and `s_i = 0`,
every sample equals `p_i`, so the distribution is a spike at today's deterministic integrity.
This is an assertion in tests.

### 3.3 Derived analytics

- **`pHold`** = fraction of samples with thesis support ≥ `FAILURE_THRESHOLD` (0.35,
  `propagation.ts:4`). This is the headline number, with `band` = [p05, p95] of integrity.
- **Keystone as variance driver (Sobol first-order):** the driver factors `z_d` are independent
  by construction, so first-order sensitivity is exact via regression of the integrity samples
  on `z_d`; rank drivers by variance explained. Within a driver, rank assumptions by squared
  standardized regression coefficient (SRC). This replaces knock-to-zero with "what actually
  moves the outcome."
- **Correlated cascade / co-failure:** fix a driver's `z_d` at a low quantile (e.g. −2σ),
  resample the rest, and report which assumptions drop below threshold **together**
  ("these four fall if vendor X slips"). One entry per driver.
- **Clusters = drivers:** group assumptions by their highest-loading driver; `variance` =
  driver's Sobol index, `loadBearing` = summed marginal contribution of its members. The module
  that is both high-variance and load-bearing is the one to zoom into (feeds the
  adaptive-dimensionality view later).

### 3.4 Reproducibility (seeded PRNG)

`makeRng(seed)` — `mulberry32` (or xorshift32) seeded from a deterministic content hash of the
graph (ids + confidences + drivers). Normals via Box–Muller on seeded uniforms. Same graph →
identical result, every run, server or client. This is how "determinism" is reframed: it demotes
from *the analysis* to *seeded reproducibility*; the intelligence is the model + correlation, not
the arithmetic. `N = 2000` default (pure JS loop; ~13 nodes × 2000 is sub-50ms).

## 4. LLM changes

- **`emit_uncertainty`** (extend the existing `extract` structured call, cheapest path): each
  assumption also returns `evidenceStrength`, grounded in its cited `evidence[]` (strong = ≥2
  corroborating, specific, recent findings; weak = thin/absent/dated). Keeps the LLM doing
  judgment; the math turns judgment into spread.
- **`emit_drivers`** (new small structured call, run on the finished graph): infer ≤5 latent
  common-mode factors and their `loadings` per assumption. Separate call keeps the extract
  prompt from bloating and lets drivers reason over the *whole* structure.
- **Fixtures backfilled** (`src/context/fixtures.ts`): scenarios A/B/R gain `evidenceStrength` +
  `drivers` so the demo runs offline with no key. Scenario A (microservices, collapses) gets
  drivers that make its collapse *correlated* — a sharper story than independent decay.
- All live calls keep the existing fixture-fallback discipline (`hasApiKey()` gate,
  `structured.ts:32`; never throw, never 500).

## 5. Phase 2 — cross-decision calibration (designed thin, built after Phase 1 is solid)

- **Persist** resolved decisions: `{ id, predictedPHold, resolvedOutcome: "hold"|"fail",
  attackCategoriesMaterialized: string[], domain, resolvedAtISO }` (Supabase table; timestamp
  passed in, never generated client-side).
- **Fit** a Platt-scaling logistic mapping predicted `P(hold)` → observed frequency, with strong
  pseudo-count shrinkage toward the identity map so a handful of points can't overreact
  (cold-start safe). Plus per-attack-category base-rate adjustments.
- **Feed back** into Phase 1: a global confidence-bias term nudges every `s_i` / recentres `m_i`
  ("you systematically over-hold"); category base rates nudge attack severities.
- **Demo-able on seeded history:** "your last six 'holds' held four times — the model now
  discounts the optimism." Works with synthetic seed rows.

## 6. UI changes (minimal, Phase 1)

Reworking the graph rail here anyway, so fold in the two owed fixes:
- Integrity gauge shows **`P(hold)` + band**, not a lone number.
- Keystone panel: ranked **variance drivers** + the correlated-collapse sentence.
- Graph: color/group nodes by **dominant driver** + a driver legend (the cluster seed).
- Folded-in owed fixes: DETAIL on by default with a redesigned panel; connection-line styling +
  the edge-overflow-into-side-panes bug.

Deferred: the full clustered-zoom / semantic-zoom navigation (its own later pass).

## 7. Testing

Pure `probabilistic.ts` unit tests (vitest):
- **Seeded determinism:** same seed → byte-identical result.
- **Correctness anchor:** `s_i = 0`, no drivers → mean integrity == deterministic `integrity()`
  for fixtures A/B/R.
- **Correlation raises joint failure:** two assumptions loading a shared driver have sampled
  correlation > 0, and `P(both below threshold)` exceeds the independent baseline.
- **Sensitivity sanity:** on a constructed graph, the driver wired to the pivotal assumption
  ranks top by Sobol index.
- Existing deterministic engine + fixture-integrity tests unchanged and green (proves engine
  untouched).

## 8. File-level plan (for the implementation plan to expand)

- `src/engine/types.ts` — add `evidenceStrength?`, `Driver`, `Graph.drivers?`, `ProbabilisticResult`.
- `src/engine/rng.ts` (new) — `makeRng(seed)`, `normal(rng)`, content-hash seed.
- `src/engine/probabilistic.ts` (new, pure) — sampling model, MC loop over `computeSupport`,
  Sobol/SRC sensitivity, co-failure, clustering.
- `src/llm/client.ts` — extend extract for `evidenceStrength`; new `emit_drivers`.
- `src/context/fixtures.ts` — backfill A/B/R with strengths + drivers.
- `src/store/useKeystone.ts` — run probabilistic solve; expose distribution/keystone/clusters
  selectors alongside the existing deterministic ("sketch") outputs.
- UI: integrity band, variance-keystone panel, driver clustering + legend; DETAIL default+redesign;
  edge styling/overflow fix.
- Phase 2: `src/engine/calibrate.ts` + decision persistence.

## 9. Risks & mitigations

- **Engine "frozen" constraint** → we only *read* `computeSupport`; new fields are engine-inert;
  zero-limit test proves the deterministic path is unchanged.
- **Perf** → cap `N`, pure numeric loops, no allocation in the hot path where avoidable.
- **Bad LLM drivers** → clamp `loading ∈ [0,1]`, cap ≤5 drivers, `Σλ² ≤ 1`; fixtures for demo.
- **Inverse-CDF complexity** → avoided by the logit-normal model (sigmoid + normals only).
- **Hydration** → seeded PRNG, no `Date`/`Math.random`.
- **Over-scoping** → clustered-zoom UI explicitly deferred; Phase 2 gated behind Phase 1.
```
