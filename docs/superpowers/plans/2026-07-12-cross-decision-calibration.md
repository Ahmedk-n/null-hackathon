# Cross-Decision Calibration (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn from the OUTCOMES of resolved decisions to calibrate the probabilistic model — correct the user's systematic over/under-confidence (a shrunk logit-space bias) and per-attack-category base rates — and surface raw-vs-calibrated `P(hold)`.

**Architecture:** New pure `@/engine/calibrate.ts` fits a bias-only Platt recalibration (shrunk toward identity by pseudo-counts) + category rates from resolved outcomes. The `decisions` table gains `predicted_p_hold`/`outcome`/`resolved_at`/`materialized_categories`. A hardened PATCH records outcomes; a server route (RLS-scoped) fits per-user calibration; a `fixtureOutcomes` dataset drives the offline/guest demo. UI shows raw → calibrated and a resolution affordance.

**Tech Stack:** Next.js 15 App Router, Supabase (RLS), zod, vitest, TypeScript. Calibration math is pure engine TS (no deps).

## Phase 2 design (firmed — see spec §5)

- **Per-user** calibration (RLS scopes reads to the signed-in user). Guest/offline demo uses `fixtureOutcomes` (mirrors the app's fixture-first fallback), clearly the demo path.
- **Bias-only Platt**: fit `b` s.t. `σ(logit(pHold)+b)` matches outcomes, shrink by `n/(n+k)` so a few points can't overreact (cold-start safe → identity).
- **Feedback**: recalibrate the live `P(hold)`/band by the logit shift (display raw → calibrated). Category rates are surfaced (and available to nudge attack severities; nudge itself is out of scope this phase — display only).

## Global Constraints

- Pure engine math (`@/engine/*`) stays boundary-clean: NO `@/llm/*`, `@/agents/*`, `@/context/compile`, `@/lib/supabase/admin`, no secrets — enforced by `src/{store,engine,context,agents}/boundary.test.ts`. `@/engine/calibrate.ts` must be pure (importable by the client store) with NO `Date.now`/`Math.random`/`new Date(`.
- Server-only compute (Supabase reads, cross-decision aggregates) lives under `src/app/api/**` using `createServerSupabase()` (RLS is the ownership guard; keep the defense-in-depth `.eq("user_id", user.id)`). Never the service-role `admin.ts` client in anything client-reachable.
- API routes NEVER 500 on bad input — validate and return 4xx; catch → clean error JSON (match the existing `[id]/route.ts` style).
- The probabilistic result is engine-inert to the deterministic solver; calibration must not touch `src/engine/propagation.ts`/`sensitivity.ts`/`load.ts`/`cascade.ts`/`probabilistic.ts` math.
- Preserve the ledger aesthetic (warm paper, 1px hairlines, UPPERCASE tracked labels, mono tabular numerals, zero radius, keystone-red).
- Migrations are additive and idempotent (`add column if not exists`); RLS already covers new columns on `decisions` (same table/policies) — no new policy needed.
- vitest + `tsc --noEmit` green at every task boundary. Quote zsh bracket paths: `"src/app/api/decisions/[id]/route.ts"`. Do NOT `git add` `tsconfig.json`/`next-env.d.ts`.

**Dependency order:** T1 (schema+persist prediction) → T2 (outcome PATCH) → T3 (calibration engine, independent, can go anytime after T1 types) → T4 (calibration route + fixtures, needs T1+T3) → T5 (store+UI display, needs T3+T4) → T6 (resolution UI + seed, needs T2). Executed sequentially.

---

### Task 1: Migration 0002 + persist `predictedPHold`

**Files:**
- Create: `supabase/migrations/0002_calibration.sql`
- Modify: `src/lib/supabase/types.ts` (DecisionRow), `src/app/api/decisions/shared.ts` (DecisionJSON + rowToJSON), `src/lib/library/types.ts` (LibraryEntry, NewLibraryEntry), `src/app/api/decisions/route.ts` (POST insert), `src/lib/library/local.ts` (guest parity), `src/app/KeystoneApp.tsx` (save path)
- Test: `src/app/api/decisions/shared.test.ts` (or extend nearest existing decisions test)

**Interfaces:**
- Produces: `decisions` columns `predicted_p_hold numeric | null`, `outcome text | null`, `resolved_at timestamptz | null`, `materialized_categories text[] | null`; `DecisionRow`/`DecisionJSON`/`LibraryEntry` gain `predictedPHold?: number | null`, `outcome?: "held" | "failed" | null`, `resolvedAtISO?: string | null`, `materializedCategories?: string[] | null`; `NewLibraryEntry` gains `predictedPHold?: number | null`.

- [ ] **Step 1: Write the migration** `supabase/migrations/0002_calibration.sql`

```sql
-- Phase 2 · cross-decision calibration: prediction + real-world outcome per decision.
alter table public.decisions add column if not exists predicted_p_hold numeric;
alter table public.decisions add column if not exists outcome text
  check (outcome in ('held','failed'));
alter table public.decisions add column if not exists resolved_at timestamptz;
alter table public.decisions add column if not exists materialized_categories text[];
-- resolved, scored decisions are what calibration reads:
create index if not exists decisions_user_resolved
  on public.decisions (user_id) where outcome is not null;
```

- [ ] **Step 2: Write the failing test** — extend the decisions shared/mapper test to assert `rowToJSON` maps the four new fields (predictedPHold/outcome/resolvedAtISO/materializedCategories). Build a `DecisionRow` fixture with those fields set and assert the mapped `DecisionJSON`.

```ts
import { describe, it, expect } from "vitest";
import { rowToJSON } from "@/app/api/decisions/shared";

it("maps calibration fields", () => {
  const row: any = {
    id: "d1", title: "t", created_at: "2026-07-12T00:00:00Z", seq: 1, mode: "custom",
    input: {}, company_context: null, pack: null, graph: {}, verdict: {}, is_public: false,
    predicted_p_hold: 0.62, outcome: "failed", resolved_at: "2026-07-13T00:00:00Z",
    materialized_categories: ["execution"],
  };
  const j = rowToJSON(row);
  expect(j.predictedPHold).toBe(0.62);
  expect(j.outcome).toBe("failed");
  expect(j.resolvedAtISO).toBe("2026-07-13T00:00:00Z");
  expect(j.materializedCategories).toEqual(["execution"]);
});
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run "src/app/api/decisions/shared.test.ts"` → FAIL (fields undefined).

- [ ] **Step 4: Implement** — add the fields to `DecisionRow`, `DecisionJSON` (+ `rowToJSON` mapping `predictedPHold: row.predicted_p_hold ?? null`, `outcome: row.outcome ?? null`, `resolvedAtISO: row.resolved_at ?? null`, `materializedCategories: row.materialized_categories ?? null`), `LibraryEntry` + `NewLibraryEntry` (`predictedPHold?`), the POST route insert (`predicted_p_hold: body.predictedPHold ?? null`), `src/lib/library/local.ts` (store/echo the field for guest parity), and `KeystoneApp.tsx` save sites (include `predictedPHold: <store>.probabilistic?.pHold ?? null` in the `NewLibraryEntry`). Read `currentVerdict()` (`KeystoneApp.tsx:131`) for the pattern and read `probabilistic` off the store the same way selectors do.

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run && npx tsc --noEmit` → PASS/clean.

- [ ] **Step 6: Commit** — `git add supabase/migrations/0002_calibration.sql src/lib/supabase/types.ts src/app/api/decisions/shared.ts src/lib/library/types.ts src/app/api/decisions/route.ts src/lib/library/local.ts src/app/KeystoneApp.tsx src/app/api/decisions/shared.test.ts && git commit -m "feat(decisions): persist predicted P(hold) + outcome columns"`

---

### Task 2: Hardened outcome-resolution PATCH

**Files:**
- Modify: `src/app/api/decisions/[id]/route.ts` (PATCH), `src/lib/library/remote.ts` (+ `src/lib/library/index.ts`) client wrapper
- Test: `src/app/api/decisions/patch-validation.test.ts`

**Interfaces:**
- Consumes: DecisionJSON fields from Task 1.
- Produces: PATCH accepts `{ verdict?, isPublic?, outcome?, materializedCategories? }` with zod validation; setting `outcome` also stamps `resolved_at = nowISO()` server-side. Client: `resolveOutcome(id, outcome: "held"|"failed", materializedCategories?: string[]): Promise<DecisionJSON>`.

Implementer notes:
- Replace the unvalidated body read (`[id]/route.ts:44-50`) with a zod schema: `verdict` (optional; validate the `{integrity,keystoneId,failedIds,loadApplied}` shape), `isPublic` (optional boolean), `outcome` (optional enum `held|failed`), `materializedCategories` (optional `string[]`). Reject unknown/invalid with 400 (never 500). This fixes the pre-existing "unvalidated PATCH verdict" gap while adding outcomes.
- When `outcome` is present, also set `patch.outcome`, `patch.materialized_categories`, and `patch.resolved_at = nowISO()`.
- Keep the `.eq("user_id", user.id)` + RLS guards and the 401/404/500-catch structure intact.

- [ ] **Step 1: Write the failing test** `src/app/api/decisions/patch-validation.test.ts` — unit-test the request-body zod schema (export it from the route or a sibling `patch-schema.ts`): rejects `{ outcome: "maybe" }`, rejects a malformed `verdict`, accepts `{ outcome: "held" }`, accepts `{ isPublic: true }`, rejects empty `{}`.

```ts
import { describe, it, expect } from "vitest";
import { PatchBody } from "@/app/api/decisions/[id]/patch-schema";

it("rejects a bad outcome", () => {
  expect(PatchBody.safeParse({ outcome: "maybe" }).success).toBe(false);
});
it("accepts a held outcome with categories", () => {
  const r = PatchBody.safeParse({ outcome: "held", materializedCategories: ["execution"] });
  expect(r.success).toBe(true);
});
it("rejects an empty patch", () => {
  expect(PatchBody.safeParse({}).success).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run "src/app/api/decisions/patch-validation.test.ts"` → FAIL (no `patch-schema`).

- [ ] **Step 3: Implement** — add `src/app/api/decisions/[id]/patch-schema.ts` exporting a zod `PatchBody` (with a `.refine` requiring ≥1 field present), wire it into the PATCH route (parse → 400 on failure), map validated fields to the DB patch incl. `resolved_at` stamp on outcome. Add `resolveOutcome` to `remote.ts` + re-export via `library/index.ts`.

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run && npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -m "feat(decisions): validated PATCH + outcome resolution endpoint"`

---

### Task 3: Calibration engine (pure)

**Files:**
- Create: `src/engine/calibrate.ts`
- Test: `src/engine/calibrate.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `ResolvedOutcome`, `Calibration`, `CalibratedResult`, `fitCalibration(outcomes, priorStrength?)`, `applyCalibration(result, cal)`.

- [ ] **Step 1: Write the failing test** `src/engine/calibrate.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { fitCalibration, applyCalibration } from "./calibrate";

const held = (p: number) => ({ predictedPHold: p, outcome: "held" as const });
const failed = (p: number) => ({ predictedPHold: p, outcome: "failed" as const });

describe("fitCalibration", () => {
  it("no data → identity (bias 0)", () => {
    const c = fitCalibration([]);
    expect(c.bias).toBe(0);
    expect(c.sampleCount).toBe(0);
  });
  it("systematic over-holding → negative bias (discounts optimism)", () => {
    // predicted high (0.8) but half actually failed
    const outcomes = [held(0.8), failed(0.8), failed(0.8), held(0.8), failed(0.8), failed(0.8)];
    const c = fitCalibration(outcomes);
    expect(c.bias).toBeLessThan(0);
    const cal = applyCalibration({ pHold: 0.8, mean: 80, band: [60, 90] }, c);
    expect(cal.calibratedPHold).toBeLessThan(0.8);
  });
  it("under-confidence → positive bias", () => {
    const outcomes = [held(0.4), held(0.4), held(0.4), held(0.4), failed(0.4)];
    expect(fitCalibration(outcomes).bias).toBeGreaterThan(0);
  });
  it("shrinks toward identity with fewer samples", () => {
    const strong = [failed(0.8), failed(0.8), failed(0.8), failed(0.8)];
    const weak = [failed(0.8), failed(0.8)];
    expect(Math.abs(fitCalibration(strong).bias)).toBeGreaterThan(Math.abs(fitCalibration(weak).bias));
  });
  it("category rates shrink toward 0.5", () => {
    const c = fitCalibration([
      { predictedPHold: 0.6, outcome: "failed", materializedCategories: ["execution"] },
      { predictedPHold: 0.6, outcome: "failed", materializedCategories: ["execution"] },
    ]);
    expect(c.categoryRates["execution"]).toBeGreaterThan(0.5);
    expect(c.categoryRates["execution"]).toBeLessThan(1);
  });
  it("applyCalibration stays in [0,1] and is identity at bias 0", () => {
    const id = fitCalibration([]);
    const r = applyCalibration({ pHold: 0.62, mean: 62, band: [14, 87] }, id);
    expect(r.calibratedPHold).toBeCloseTo(0.62, 6);
    expect(r.calibratedBand[0]).toBeGreaterThanOrEqual(0);
    expect(r.calibratedBand[1]).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/calibrate.test.ts` → FAIL (no module).

- [ ] **Step 3: Create `src/engine/calibrate.ts`**

```ts
// Pure, boundary-clean. Learns a shrunk confidence-bias + category base rates from resolved decision
// outcomes, and recalibrates a probabilistic result. No Date/Math.random — deterministic.

export interface ResolvedOutcome {
  predictedPHold: number;              // 0..1 — the model's P(hold) at decision time
  outcome: "held" | "failed";
  materializedCategories?: string[];   // attack categories that actually came true
}

export interface Calibration {
  bias: number;                        // logit-space shift; <0 = you over-hold (optimism discounted)
  sampleCount: number;
  rawHoldRate: number;                 // observed fraction that held
  predictedMean: number;               // mean predicted pHold
  categoryRates: Record<string, number>; // shrunk materialization rate per category
}

export interface CalibratedResult {
  calibratedPHold: number;             // 0..1
  calibratedMean: number;              // 0..100
  calibratedBand: [number, number];    // 0..100
}

const EPS = 1e-6;
const PRIOR_STRENGTH = 4;              // pseudo-count pull toward identity (bias 0)

function logit(p: number): number {
  const c = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Bias-only Platt recalibration. Fit b minimizing logistic loss of σ(logit(p_i)+b) vs outcome
 * (convex 1-D → Newton), then shrink by n/(n+k) toward identity so few points can't overreact.
 */
export function fitCalibration(
  outcomes: ResolvedOutcome[],
  priorStrength: number = PRIOR_STRENGTH,
): Calibration {
  const n = outcomes.length;
  if (n === 0) {
    return { bias: 0, sampleCount: 0, rawHoldRate: 0, predictedMean: 0, categoryRates: {} };
  }
  const z = outcomes.map((o) => logit(o.predictedPHold));
  const y = outcomes.map((o) => (o.outcome === "held" ? 1 : 0));
  let b = 0;
  for (let iter = 0; iter < 25; iter++) {
    let g = 0;
    let h = 0;
    for (let i = 0; i < n; i++) {
      const s = sigmoid(z[i] + b);
      g += s - y[i];
      h += s * (1 - s);
    }
    if (h < EPS) break;
    const step = g / h;
    b -= step;
    if (Math.abs(step) < 1e-9) break;
  }
  const bias = b * (n / (n + priorStrength));
  const rawHoldRate = y.reduce((a, v) => a + v, 0) / n;
  const predictedMean = outcomes.reduce((a, o) => a + o.predictedPHold, 0) / n;

  const counts: Record<string, number> = {};
  for (const o of outcomes) for (const c of o.materializedCategories ?? []) counts[c] = (counts[c] ?? 0) + 1;
  const categoryRates: Record<string, number> = {};
  for (const c of Object.keys(counts)) {
    const rate = counts[c] / n;
    categoryRates[c] = (n * rate + priorStrength * 0.5) / (n + priorStrength); // shrink toward 0.5
  }
  return { bias, sampleCount: n, rawHoldRate, predictedMean, categoryRates };
}

/** Apply the calibration bias to a probabilistic result (logit-space shift of pHold + band). */
export function applyCalibration(
  result: { pHold: number; mean: number; band: [number, number] },
  cal: Calibration,
): CalibratedResult {
  const shift01 = (p01: number) => sigmoid(logit(p01) + cal.bias);
  return {
    calibratedPHold: shift01(result.pHold),
    calibratedMean: shift01(result.mean / 100) * 100,
    calibratedBand: [shift01(result.band[0] / 100) * 100, shift01(result.band[1] / 100) * 100],
  };
}
```

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/engine/calibrate.test.ts && npx tsc --noEmit` → PASS/clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(engine): cross-decision calibration (shrunk bias-Platt + category rates)"`

---

### Task 4: Calibration server route + `fixtureOutcomes`

**Files:**
- Create: `src/app/api/decisions/calibration/route.ts`, `src/context/fixtureOutcomes.ts`, `src/lib/library/calibration.ts` (client fetch + guest fixture fallback)
- Test: `src/context/fixtureOutcomes.test.ts`

**Interfaces:**
- Consumes: `fitCalibration` (T3), `createServerSupabase`, DecisionRow fields (T1).
- Produces: `GET /api/decisions/calibration` → `{ calibration: Calibration }` (RLS-scoped: reads the user's `outcome is not null` decisions, maps to `ResolvedOutcome{ predictedPHold: predicted_p_hold, outcome, materializedCategories: materialized_categories }`, `fitCalibration`); `fixtureOutcomes: ResolvedOutcome[]` (a synthetic over-holder, ~8 rows, deterministic — NO Date/random); client `fetchCalibration(isGuest: boolean): Promise<Calibration>` returning `fitCalibration(fixtureOutcomes)` for guest/unauth or on any fetch failure, else the route's calibration.

Implementer notes:
- The route: 401 if no user? No — return an identity/guest-safe calibration is wrong for a real route; instead 401 like the others and let the CLIENT fall back to fixtures when unauth (guest). Keep the never-500 catch.
- `fixtureOutcomes`: hand-author ~8 resolved outcomes of a systematic over-holder (high predicted pHold, ~half failed) with a couple `materializedCategories` so `fitCalibration` yields a clearly-negative bias and a visible category rate — this is what makes the offline demo show the mechanism.
- Boundary: the route is server-only (fine to import supabase). `fixtureOutcomes.ts` and `calibration.ts` are client-reachable → pure/`@/engine` + fetch only, NO `@/lib/supabase/*` value imports.

- [ ] **Step 1: Write the failing test** `src/context/fixtureOutcomes.test.ts` — assert `fixtureOutcomes` is non-empty and `fitCalibration(fixtureOutcomes).bias < 0` (the demo over-holder) with `sampleCount === fixtureOutcomes.length`.

- [ ] **Step 2: Run to verify failure** — FAIL (no module).

- [ ] **Step 3: Implement** the fixture dataset, the route, and the client `fetchCalibration`. Confirm boundary tests still pass (`src/context/boundary.test.ts`).

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run && npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -m "feat(calibration): RLS-scoped calibration route + offline fixtureOutcomes"`

---

### Task 5: Store wiring + raw-vs-calibrated UI

**Files:**
- Modify: `src/store/useKeystone.ts` (calibration state + setter + selector), `src/app/KeystoneApp.tsx` (fetch calibration on load), `src/ui/IntegrityGauge.tsx` and/or the verdict rail in `src/ui/tabs/GraphTab.tsx`/`StressTab.tsx` (show raw → calibrated + bias caption)
- Test: extend `src/store/*.test.ts` and a UI tab test

**Interfaces:**
- Consumes: `Calibration`, `applyCalibration` (T3), `fetchCalibration` (T4), `selectProbabilistic` (Phase 1).
- Produces: `KeystoneState.calibration: Calibration | null`, `setCalibration`, `selectCalibration`.

Implementer notes:
- Store: add `calibration: Calibration | null` (init null), `setCalibration(c)`. Do NOT call `fetch` in the store (boundary/purity) — fetch in `KeystoneApp` (client component) via `fetchCalibration(isGuest)` and push into the store with `setCalibration`. Trigger once on mount / after auth resolves.
- UI: when `calibration` present AND `probabilistic` present, compute `applyCalibration(probabilistic, calibration)` (pure, in render is fine — no Date/random) and render `RAW <pHold%> → CALIBRATED <calibratedPHold%>` with a one-line interpretation from `bias`/`sampleCount` ("adjusted for your track record — you over-hold; n=<count>"). When `sampleCount===0`, show raw only (no calibrated claim). Keep it inside the ledger aesthetic near the existing HOLDS gauge.

- [ ] **Step 1: Write the failing test** — store test: `setCalibration` then `selectCalibration` returns it; UI test: with a negative-bias calibration + a probabilistic result, the gauge renders a "CALIBRATED" string with a lower value than raw.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** store field/selector, the `KeystoneApp` fetch-and-set, and the gauge/rail display.

- [ ] **Step 4: Run tests + typecheck** — full `npx vitest run && npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -m "feat(ui): raw → calibrated P(hold) from cross-decision track record"`

---

### Task 6: Resolution UI (mark outcome) + demo seed

**Files:**
- Modify: `src/app/account/page.tsx` (per-decision outcome control calling `resolveOutcome`)
- Create: `scripts/seed-outcomes.mjs` (dev-only: insert synthetic resolved decisions for the signed-in demo user via the API/Supabase)
- Test: extend the account-page test (or add one) asserting the outcome control calls the resolve wrapper

**Interfaces:**
- Consumes: `resolveOutcome` (T2).

Implementer notes:
- Account page lists the user's saved decisions (read the current list rendering first). Add, per entry, a small "OUTCOME · HELD / FAILED" control (ledger buttons) that calls `resolveOutcome(id, outcome)` and reflects the stored `outcome`/`resolvedAtISO`. Resolved entries show their recorded outcome.
- `scripts/seed-outcomes.mjs`: a node script that POSTs a handful of decisions and PATCHes outcomes (over-holder pattern) against a local dev server for a signed-in session — for demoing the REAL path. Document usage in a header comment; it is NOT wired into the app or tests.

- [ ] **Step 1: Write the failing test** — account-page test: rendering an unresolved entry shows HELD/FAILED controls; clicking FAILED calls `resolveOutcome(id, "failed")` (mock the wrapper).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** the account-page control + the seed script.

- [ ] **Step 4: Run tests + typecheck** — full `npx vitest run && npx tsc --noEmit`. Visual check optional (isolated `:3002` server; revert any tsconfig/next-env pollution).

- [ ] **Step 5: Commit** — `git commit -m "feat(account): mark decision outcome + demo seed script"`

---

## Self-Review

**Spec coverage (§5):** persist prediction → T1; resolution flow (endpoint + UI) → T2, T6; shrunk-Platt calibration + category rates → T3; RLS-scoped fit + cold-start fixtures → T4; feedback display (raw→calibrated) → T5. Category-rate *nudge to attack severities* is explicitly display-only this phase (noted in design) — surfaced, not applied.

**Placeholder scan:** T3 (the substance) is complete code; T1/T2/T4/T5/T6 give exact schemas, exact file anchors, the validation contract, and representative test code — no "add validation"-style hand-waving (the zod contract and never-500 rule are explicit).

**Type consistency:** `ResolvedOutcome{predictedPHold,outcome,materializedCategories?}`, `Calibration{bias,sampleCount,rawHoldRate,predictedMean,categoryRates}`, `CalibratedResult{calibratedPHold,calibratedMean,calibratedBand}`, `fitCalibration`, `applyCalibration`, `resolveOutcome`, `fetchCalibration`, `fixtureOutcomes`, store `calibration`/`setCalibration`/`selectCalibration` — consistent across T1–T6. DB snake_case (`predicted_p_hold`,`outcome`,`resolved_at`,`materialized_categories`) ↔ JSON camelCase mapping lives only in `rowToJSON` (T1).

**Known pre-existing issue folded in:** the unvalidated PATCH verdict is fixed by T2's zod schema. The separate POST `seq` race is out of scope (flagged; not a calibration concern) — leave for a dedicated fix unless asked.
