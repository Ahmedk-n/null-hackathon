# Probabilistic Decision Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "one LLM scalar per assumption + independent multiply" with a seeded Monte-Carlo brain that samples evidence-grounded uncertainty and latent common-mode correlation over the *existing* engine, yielding `P(hold)`+band, a variance-driver keystone, correlated cascade, and driver clusters.

**Architecture:** New pure modules (`rng.ts`, `probabilistic.ts`) wrap the frozen engine: they sample assumption confidences from a logit-normal factor model (marginal spread from `evidenceStrength`, correlation from `Driver` loadings), call the unchanged `computeSupport` N times, and aggregate. Two additive LLM outputs (`evidenceStrength`, `drivers`) feed it; fixtures are backfilled so it runs offline. Store computes the result post-solve; UI shows band + variance keystone + driver clusters.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, vitest, Zustand store, Playwright (verify only). Pure numeric TS for the solver — no new deps.

## Global Constraints

- The pure engine (`src/engine/propagation.ts`, `sensitivity.ts`, `load.ts`, `cascade.ts`) math is OFF-LIMITS — read `computeSupport`/`integrity`, never edit them. New type fields are **engine-inert** (the pure solver must never read them), exactly like `evidence`/`provenance` (`types.ts:10-16,46`).
- `types.ts` and `propagation.ts` are Founder-B integration STUBS ("replace on merge"). Additive optional fields are safe on this branch; note the merge-coordination risk, do not restructure them.
- NO `Date.now`/`Math.random`/`new Date(` anywhere reachable from a `"use client"` file — the solver uses a **seeded PRNG** only (hydration safety).
- Preserve the ledger visual language: warm paper, 1px hairlines, UPPERCASE tracked labels, mono tabular numerals, zero radius, keystone-red accent.
- Every live LLM path keeps the fixture-fallback discipline: `hasApiKey()` gate (`structured.ts:32`), never throw, never 500 — fall back to fixture on any failure.
- Do NOT `git add` `next-env.d.ts` or `tsconfig.json` (dev-server `.next-agent` pollution). Stage only task files.
- Verify server (only if a task needs a running app): `NEXT_DIST_DIR=.next-agent npx next dev -p 3002` — isolated; never touch the user's :3000 / `.next`. `tsc` + `vitest` need no server.
- `npx vitest run` and `npx tsc --noEmit` must be green at every task boundary. In zsh, quote bracket test paths: `"src/app/d/[id]/page.test.tsx"`.

**Dependency order (for fan-out):** Task 1 is the foundation. After it lands, Tasks 4 (LLM) and 5 (fixtures) touch disjoint files and may run in parallel with Tasks 2→3 (both in `probabilistic.ts`, sequential). Task 6 needs 2/3/5. Task 7 needs 6.

---

### Task 1: Seeded RNG + engine type additions

**Files:**
- Create: `src/engine/rng.ts`
- Modify: `src/engine/types.ts` (append after line 69)
- Test: `src/engine/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `makeRng(seed: number): () => number` — uniform [0,1) generator (mulberry32).
  - `hashSeed(s: string): number` — FNV-1a 32-bit unsigned.
  - `normal(rng: () => number): number` — standard normal (Box–Muller).
  - `GraphNode.evidenceStrength?: "weak" | "moderate" | "strong"` (assumptions only).
  - `Driver = { id: string; label: string; loadings: { assumptionId: string; loading: number }[] }` (`loading ∈ [0,1]`).
  - `Graph.drivers?: Driver[]`.
  - `ProbabilisticResult` (shape below; fields produced by Tasks 2–3).

- [ ] **Step 1: Write the failing test** — `src/engine/rng.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { makeRng, hashSeed, normal } from "./rng";

describe("rng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });

  it("hashSeed is stable and unsigned", () => {
    const h = hashSeed("thesis|c1:0.8|a1:0.9");
    expect(h).toBe(hashSeed("thesis|c1:0.8|a1:0.9"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });

  it("normal() is ~mean 0, ~sd 1 over many samples", () => {
    const rng = makeRng(7);
    const xs = Array.from({ length: 20000 }, () => normal(rng));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(sd - 1)).toBeLessThan(0.05);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/rng.test.ts`
Expected: FAIL — cannot find module `./rng`.

- [ ] **Step 3: Create `src/engine/rng.ts`**

```ts
// Pure, seeded PRNG for reproducible Monte-Carlo. No Date/Math.random — hydration-safe.

/** mulberry32 — fast, seedable uniform [0,1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash → stable unsigned seed from graph content. */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Standard normal via Box–Muller, drawing from the supplied uniform rng. */
export function normal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
```

- [ ] **Step 4: Append type additions to `src/engine/types.ts`** (after line 69, end of file)

```ts
/**
 * PROBABILISTIC MODEL additions (2026-07). All OPTIONAL, purely additive, ENGINE-INERT:
 * the pure solver (propagation/sensitivity/load/cascade) NEVER reads these. They feed the
 * separate Monte-Carlo brain in `probabilistic.ts`. Kept engine-inert exactly like `evidence`.
 */

/** How solid an assumption's cited evidence is → maps to sampling spread. Assumptions only. */
export type EvidenceStrength = "weak" | "moderate" | "strong";

/**
 * A latent common-mode factor several assumptions share (a vendor, an adoption bet, a rate
 * environment). `loading ∈ [0,1]` is the magnitude of an assumption's dependence on it; a driver
 * "failing" pushes every loaded assumption's confidence DOWN together. This is the correlation
 * structure the naive independent product ignores.
 */
export interface Driver {
  id: string;
  label: string;
  loadings: { assumptionId: string; loading: number }[];
}

/** Output of the Monte-Carlo brain. Integrity as a distribution, not a point. */
export interface ProbabilisticResult {
  pHold: number;                 // fraction of samples with thesis support >= FAILURE_THRESHOLD
  mean: number;                  // mean integrity, 0..100
  band: [number, number];        // [p05, p95] of integrity
  samples: number;               // N used
  keystoneDrivers: { id: string; label: string; sensitivity: number }[];   // Sobol first-order, desc
  keystoneAssumptions: { id: string; influence: number }[];                // squared corr(y, c_i), desc
  clusters: { driverId: string; label: string; assumptionIds: string[]; variance: number; loadBearing: number }[];
  coFailure: { driverId: string; label: string; assumptionIds: string[] }[]; // who falls together on a low-driver shock
}
```

Then extend `GraphNode` (add inside the interface, after `provenance?`):

```ts
  /**
   * PROBABILISTIC · assumption-only evidence strength → Monte-Carlo sampling spread. Engine-inert.
   * Undefined defaults to "moderate" in the solver.
   */
  evidenceStrength?: EvidenceStrength;
```

And extend `Graph`:

```ts
export interface Graph {
  nodes: GraphNode[];
  thesisId: string;
  /** PROBABILISTIC · latent common-mode drivers. Engine-inert; consumed only by probabilistic.ts. */
  drivers?: Driver[];
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/engine/rng.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/rng.ts src/engine/rng.test.ts src/engine/types.ts
git commit -m "feat(engine): seeded rng + engine-inert probabilistic types"
```

---

### Task 2: Probabilistic solver core (sampling + P(hold)/mean/band)

**Files:**
- Create: `src/engine/probabilistic.ts`
- Test: `src/engine/probabilistic.test.ts`

**Interfaces:**
- Consumes: `makeRng`, `hashSeed`, `normal` (Task 1); `computeSupport`, `FAILURE_THRESHOLD`, `clamp01` (`propagation.ts`); `Graph`, `Driver`, `ProbabilisticResult`, `EvidenceStrength` (Task 1).
- Produces:
  - `SPREAD_BY_STRENGTH: Record<EvidenceStrength, number>` = `{ strong: 0.35, moderate: 0.8, weak: 1.5 }`.
  - `runProbabilistic(graph: Graph, opts?: { samples?: number; seed?: number }): ProbabilisticResult`.
  - Internal (exported for Task 3 + tests): `sampleRun(...)` producing per-sample arrays. Keep `keystoneDrivers`/`keystoneAssumptions`/`clusters`/`coFailure` as EMPTY arrays in this task; Task 3 fills them.

Notes for the implementer:
- Sample **only** `type === "assumption"` nodes. Thesis/claims keep their confidence (structural, pinned 1.0).
- `m_i = logit(clamp01(confidence))`, `s_i = SPREAD_BY_STRENGTH[evidenceStrength ?? "moderate"]`.
- Correlated shock: `x_i = Σ_d λ_{i,d}·z_d + sqrt(1 − Σ_d λ_{i,d}²)·ε_i`, with `Σλ²` clamped to ≤1. `z_d` shared per sample, `ε_i` idiosyncratic. `c_i = sigmoid(m_i + s_i·x_i)`.
- Reuse ONE cloned graph; overwrite assumption confidences per sample; call `computeSupport`; read `thesisId` support. `integrity = support·100`, `hold = support ≥ FAILURE_THRESHOLD`.
- Seed: `opts.seed ?? hashSeed(seedString(graph))` where `seedString` = ids + confidences + driver loadings joined — deterministic.

- [ ] **Step 1: Write the failing test** — `src/engine/probabilistic.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { runProbabilistic } from "./probabilistic";
import { integrity } from "./propagation";
import type { Graph } from "./types";

// thesis (AND of one claim) ← claim (AND of two leaf assumptions)
function graph(a1 = 0.8, a2 = 0.8, strength: any = "moderate", drivers?: any): Graph {
  return {
    thesisId: "t",
    drivers,
    nodes: [
      { id: "t", type: "thesis", label: "T", confidence: 1, groups: [{ kind: "AND", childIds: ["c"] }] },
      { id: "c", type: "claim", label: "C", confidence: 1, groups: [{ kind: "AND", childIds: ["a1", "a2"] }] },
      { id: "a1", type: "assumption", label: "A1", confidence: a1, evidenceStrength: strength, groups: [] },
      { id: "a2", type: "assumption", label: "A2", confidence: a2, evidenceStrength: strength, groups: [] },
    ],
  };
}

describe("runProbabilistic", () => {
  it("is deterministic for a fixed seed", () => {
    const r1 = runProbabilistic(graph(), { seed: 42, samples: 1000 });
    const r2 = runProbabilistic(graph(), { seed: 42, samples: 1000 });
    expect(r1).toEqual(r2);
  });

  it("zero-spread (strong evidence, no drivers) collapses to the deterministic integrity", () => {
    // strong spread is small but non-zero; assert mean is within a tight band of the point solve.
    const g = graph(0.8, 0.8, "strong");
    const r = runProbabilistic(g, { seed: 1, samples: 4000 });
    expect(Math.abs(r.mean - integrity(g))).toBeLessThan(4); // 0..100 scale
  });

  it("weak evidence widens the band vs strong", () => {
    const weak = runProbabilistic(graph(0.7, 0.7, "weak"), { seed: 3, samples: 4000 });
    const strong = runProbabilistic(graph(0.7, 0.7, "strong"), { seed: 3, samples: 4000 });
    const w = weak.band[1] - weak.band[0];
    const s = strong.band[1] - strong.band[0];
    expect(w).toBeGreaterThan(s);
  });

  it("shared driver raises joint-failure probability vs independent", () => {
    const drivers = [{ id: "d1", label: "vendor", loadings: [{ assumptionId: "a1", loading: 0.9 }, { assumptionId: "a2", loading: 0.9 }] }];
    const correlated = runProbabilistic(graph(0.6, 0.6, "weak", drivers), { seed: 5, samples: 6000 });
    const independent = runProbabilistic(graph(0.6, 0.6, "weak"), { seed: 5, samples: 6000 });
    // correlated collapse fattens the low tail → lower pHold at the same marginals.
    expect(correlated.pHold).toBeLessThan(independent.pHold);
  });

  it("reports pHold in [0,1] and an ordered band", () => {
    const r = runProbabilistic(graph(), { seed: 9, samples: 500 });
    expect(r.pHold).toBeGreaterThanOrEqual(0);
    expect(r.pHold).toBeLessThanOrEqual(1);
    expect(r.band[0]).toBeLessThanOrEqual(r.band[1]);
    expect(r.samples).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/probabilistic.test.ts`
Expected: FAIL — cannot find module `./probabilistic`.

- [ ] **Step 3: Create `src/engine/probabilistic.ts`**

```ts
// Pure, seeded Monte-Carlo over the FROZEN engine. Samples assumption confidences from a
// logit-normal factor model: marginal spread from evidenceStrength, correlation from Driver
// loadings. Calls computeSupport N times; aggregates integrity into a distribution.
// Engine math is untouched — this only READS computeSupport.
import type { Graph, GraphNode, Driver, EvidenceStrength, ProbabilisticResult } from "./types";
import { computeSupport, FAILURE_THRESHOLD, clamp01 } from "./propagation";
import { makeRng, hashSeed, normal } from "./rng";

export const SPREAD_BY_STRENGTH: Record<EvidenceStrength, number> = {
  strong: 0.35,
  moderate: 0.8,
  weak: 1.5,
};

const DEFAULT_SAMPLES = 2000;

function logit(p: number): number {
  const c = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function seedString(graph: Graph): string {
  const nodes = graph.nodes.map((n) => `${n.id}:${n.confidence}:${n.evidenceStrength ?? "-"}`).join(",");
  const drivers = (graph.drivers ?? [])
    .map((d) => `${d.id}[${d.loadings.map((l) => `${l.assumptionId}=${l.loading}`).join("|")}]`)
    .join(",");
  return `${graph.thesisId}#${nodes}#${drivers}`;
}

interface Prepared {
  assumptions: { id: string; m: number; s: number; loadings: number[]; comm: number }[];
  drivers: Driver[];
}

function prepare(graph: Graph): Prepared {
  const drivers = graph.drivers ?? [];
  const assumptions = graph.nodes
    .filter((n) => n.type === "assumption")
    .map((n: GraphNode) => {
      const loadings = drivers.map((d) => {
        const hit = d.loadings.find((l) => l.assumptionId === n.id);
        return hit ? clamp01(hit.loading) : 0;
      });
      const sumSq = loadings.reduce((acc, l) => acc + l * l, 0);
      const comm = Math.min(1, sumSq); // communality ≤ 1
      return {
        id: n.id,
        m: logit(clamp01(n.confidence)),
        s: SPREAD_BY_STRENGTH[n.evidenceStrength ?? "moderate"],
        loadings,
        comm,
      };
    });
  return { assumptions, drivers };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp01(q) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Per-sample record kept for aggregation + sensitivity (Task 3). */
export interface SampleTrace {
  integrities: number[];        // length N, 0..100
  holds: number;                // count of samples above threshold
  z: number[][];                // [N][driverCount] shared factor draws
  conf: Record<string, number[]>; // assumptionId → length-N sampled confidence
}

export function sampleRun(graph: Graph, samples: number, seed: number): { prep: Prepared; trace: SampleTrace } {
  const prep = prepare(graph);
  const rng = makeRng(seed);
  const clone: Graph = { ...graph, nodes: graph.nodes.map((n) => ({ ...n })) };
  const nodeById = new Map(clone.nodes.map((n) => [n.id, n]));

  const integrities: number[] = new Array(samples);
  const z: number[][] = new Array(samples);
  const conf: Record<string, number[]> = {};
  for (const a of prep.assumptions) conf[a.id] = new Array(samples);
  let holds = 0;

  for (let s = 0; s < samples; s++) {
    const zRow = prep.drivers.map(() => normal(rng));
    z[s] = zRow;
    for (const a of prep.assumptions) {
      let shared = 0;
      for (let d = 0; d < zRow.length; d++) shared += a.loadings[d] * zRow[d];
      const eps = normal(rng);
      const x = shared + Math.sqrt(Math.max(0, 1 - a.comm)) * eps;
      const c = sigmoid(a.m + a.s * x);
      conf[a.id][s] = c;
      nodeById.get(a.id)!.confidence = c;
    }
    const support = computeSupport(clone).get(clone.thesisId) ?? 0;
    integrities[s] = support * 100;
    if (support >= FAILURE_THRESHOLD) holds++;
  }
  return { prep, trace: { integrities, holds, z, conf } };
}

export function runProbabilistic(
  graph: Graph,
  opts?: { samples?: number; seed?: number },
): ProbabilisticResult {
  const samples = opts?.samples ?? DEFAULT_SAMPLES;
  const seed = opts?.seed ?? hashSeed(seedString(graph));
  const { trace } = sampleRun(graph, samples, seed);
  const sorted = [...trace.integrities].sort((a, b) => a - b);
  const mean = trace.integrities.reduce((s, v) => s + v, 0) / samples;
  return {
    pHold: trace.holds / samples,
    mean,
    band: [quantile(sorted, 0.05), quantile(sorted, 0.95)],
    samples,
    keystoneDrivers: [],       // Task 3
    keystoneAssumptions: [],   // Task 3
    clusters: [],              // Task 3
    coFailure: [],             // Task 3
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/engine/probabilistic.test.ts && npx tsc --noEmit`
Expected: PASS (all 5 cases); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/probabilistic.ts src/engine/probabilistic.test.ts
git commit -m "feat(engine): monte-carlo probabilistic solver (uncertainty + correlation)"
```

---

### Task 3: Sensitivity, clusters, correlated co-failure

**Files:**
- Modify: `src/engine/probabilistic.ts` (fill the four empty arrays in `runProbabilistic`)
- Test: `src/engine/probabilistic.test.ts` (append)

**Interfaces:**
- Consumes: `SampleTrace`, `Prepared` from Task 2.
- Produces: populated `keystoneDrivers`, `keystoneAssumptions`, `clusters`, `coFailure` on `ProbabilisticResult`.

Algorithms:
- **Driver sensitivity (Sobol first-order):** the `z_d` are independent standard normals, so first-order sensitivity ≈ `corr(integrities, z_d)²`. Compute Pearson corr of the integrity series against each driver's `z` column; square; that's `sensitivity ∈ [0,1]`. Sort desc.
- **Assumption influence:** `corr(integrities, conf[id])²`, sorted desc.
- **Clusters:** each assumption's dominant driver = argmax loading (only if max loading > 0; else it joins no cluster). One cluster per driver that owns ≥1 assumption. `variance` = that driver's sensitivity; `loadBearing` = sum of member influences.
- **Co-failure:** for each driver, run ONE extra shocked pass (reuse `sampleRun`-style loop, but fix `z_d = -2` and other `z = 0`, `ε = 0`): compute each member's `c_i` and the graph's per-node support; list member assumptionIds whose shocked support < `FAILURE_THRESHOLD`. Deterministic (no rng needed for the fixed shock). Implement a small helper `shockDriver(prep, graph, driverIndex)`.

- [ ] **Step 1: Append failing tests**

```ts
describe("runProbabilistic — sensitivity & clusters", () => {
  const drivers = [
    { id: "d1", label: "vendor", loadings: [{ assumptionId: "a1", loading: 0.95 }, { assumptionId: "a2", loading: 0.95 }] },
  ];
  const g = {
    thesisId: "t",
    drivers,
    nodes: [
      { id: "t", type: "thesis", label: "T", confidence: 1, groups: [{ kind: "AND", childIds: ["c"] }] },
      { id: "c", type: "claim", label: "C", confidence: 1, groups: [{ kind: "AND", childIds: ["a1", "a2"] }] },
      { id: "a1", type: "assumption", label: "A1", confidence: 0.6, evidenceStrength: "weak", groups: [] },
      { id: "a2", type: "assumption", label: "A2", confidence: 0.6, evidenceStrength: "weak", groups: [] },
    ],
  } as any;

  it("ranks the wired driver as top sensitivity", () => {
    const r = runProbabilistic(g, { seed: 11, samples: 6000 });
    expect(r.keystoneDrivers[0]?.id).toBe("d1");
    expect(r.keystoneDrivers[0]?.sensitivity).toBeGreaterThan(0);
  });

  it("clusters both assumptions under the shared driver", () => {
    const r = runProbabilistic(g, { seed: 11, samples: 2000 });
    const cluster = r.clusters.find((c) => c.driverId === "d1");
    expect(cluster?.assumptionIds.sort()).toEqual(["a1", "a2"]);
  });

  it("reports co-failure of the loaded assumptions under a driver shock", () => {
    const r = runProbabilistic(g, { seed: 11, samples: 2000 });
    const cf = r.coFailure.find((c) => c.driverId === "d1");
    expect(cf?.assumptionIds.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/probabilistic.test.ts -t "sensitivity"`
Expected: FAIL — empty arrays.

- [ ] **Step 3: Implement the analytics** (add helpers + replace the empty arrays)

```ts
function corr(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

// Deterministic single-shock pass: fix driver `di` at -2σ, all other factors/idiosyncratic at 0.
function shockDriver(prep: Prepared, graph: Graph, di: number): Set<string> {
  const clone: Graph = { ...graph, nodes: graph.nodes.map((n) => ({ ...n })) };
  const byId = new Map(clone.nodes.map((n) => [n.id, n]));
  for (const a of prep.assumptions) {
    const x = a.loadings[di] * -2; // others zeroed
    byId.get(a.id)!.confidence = sigmoid(a.m + a.s * x);
  }
  const support = computeSupport(clone);
  const failed = new Set<string>();
  for (const a of prep.assumptions) {
    if ((support.get(a.id) ?? 0) < FAILURE_THRESHOLD) failed.add(a.id);
  }
  return failed;
}
```

Then in `runProbabilistic`, after building `trace`, replace the four empty arrays:

```ts
  const driverCount = prep.drivers.length;
  const keystoneDrivers = prep.drivers
    .map((d, di) => ({ id: d.id, label: d.label, sensitivity: corr(trace.integrities, trace.z.map((row) => row[di])) ** 2 }))
    .sort((a, b) => b.sensitivity - a.sensitivity);

  const keystoneAssumptions = prep.assumptions
    .map((a) => ({ id: a.id, influence: corr(trace.integrities, trace.conf[a.id]) ** 2 }))
    .sort((a, b) => b.influence - a.influence);

  const influenceById = new Map(keystoneAssumptions.map((k) => [k.id, k.influence]));
  const sensById = new Map(keystoneDrivers.map((k) => [k.id, k.sensitivity]));
  const clusters = prep.drivers
    .map((d, di) => {
      const members = prep.assumptions.filter((a) => {
        const max = Math.max(...a.loadings, 0);
        return a.loadings[di] > 0 && a.loadings[di] === max;
      });
      return {
        driverId: d.id,
        label: d.label,
        assumptionIds: members.map((m) => m.id),
        variance: sensById.get(d.id) ?? 0,
        loadBearing: members.reduce((s, m) => s + (influenceById.get(m.id) ?? 0), 0),
      };
    })
    .filter((c) => c.assumptionIds.length > 0);

  const coFailure = prep.drivers
    .map((d, di) => ({ driverId: d.id, label: d.label, assumptionIds: [...shockDriver(prep, graph, di)] }))
    .filter((c) => c.assumptionIds.length > 0);
```

and return them instead of the `[]` placeholders. `driverCount` may be unused — drop it if lint complains.

- [ ] **Step 4: Run tests + full engine suite + typecheck**

Run: `npx vitest run src/engine && npx tsc --noEmit`
Expected: PASS (all probabilistic + untouched engine tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/probabilistic.ts src/engine/probabilistic.test.ts
git commit -m "feat(engine): variance-driver keystone, driver clusters, correlated co-failure"
```

---

### Task 4: LLM outputs — `evidenceStrength` on extract + new `emit_drivers`

**Files:**
- Modify: `src/llm/client.ts` (extract schema/prompt ~114-190; add `generateDrivers` after `generateAttacks` ~321)
- Test: `src/llm/drivers.test.ts` (fixture-fallback path; no network)

**Interfaces:**
- Consumes: `structuredCall` (`src/llm/structured.ts`), `hasApiKey`, `Graph`, `Driver` (Task 1). Follow the EXACT pattern of `generateAttacks`/`generateAttacksWithSource` (`client.ts:273-321`): forced tool call + zod schema + fixture fallback.
- Produces:
  - Extend the extract tool schema so each node MAY emit `"evidenceStrength": "weak"|"moderate"|"strong"` (assumptions), validated by the extract zod schema; thread it into the returned `GraphNode`.
  - `generateDrivers(graph: Graph, apiKey?: string): Promise<Driver[]>` — forced `emit_drivers` tool call; returns `[]` on no-key/any-failure (never throws).

Implementer notes:
- In the extract prompt (`EXTRACT_SYSTEM`, ~114-157) add a line: `evidenceStrength: "strong" when ≥2 specific, recent, corroborating findings back the assumption; "weak" when thin/absent/dated; else "moderate". Assumptions only.` Add `evidenceStrength` to the node schema as an optional enum; coerce missing → omit (solver defaults to moderate).
- `emit_drivers` prompt: "Given this decision's assumptions, infer up to 5 latent common-mode factors (shared vendor, market/rate condition, one adoption bet, one team/capability) that multiple assumptions depend on. For each, list the assumptionIds that load on it with loading 0..1 (0 = none, 1 = fully determined by it). Only include a driver if ≥2 assumptions load ≥0.3. Output {drivers:[{id,label,loadings:[{assumptionId,loading}]}]}." Validate with a zod schema; clamp loadings to [0,1]; cap 5 drivers.

- [ ] **Step 1: Write the failing test** — `src/llm/drivers.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { generateDrivers } from "./client";
import { fixtureContextGraph } from "@/context/fixtures";

describe("generateDrivers (no-key fixture path)", () => {
  it("returns an array without throwing when no API key is present", async () => {
    const drivers = await generateDrivers(fixtureContextGraph); // no key arg → hasApiKey() false in test
    expect(Array.isArray(drivers)).toBe(true);
    drivers.forEach((d) => {
      expect(typeof d.id).toBe("string");
      d.loadings.forEach((l) => {
        expect(l.loading).toBeGreaterThanOrEqual(0);
        expect(l.loading).toBeLessThanOrEqual(1);
      });
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/llm/drivers.test.ts`
Expected: FAIL — `generateDrivers` not exported.

- [ ] **Step 3: Implement** `generateDrivers` in `client.ts` (mirror `generateAttacks`), and add optional `evidenceStrength` to the extract node schema + prompt line. Return `[]` when `!hasApiKey()` or on any caught error. Clamp/cap as above.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/llm && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/llm/client.ts src/llm/drivers.test.ts
git commit -m "feat(llm): evidenceStrength on extract + emit_drivers latent-factor call"
```

---

### Task 5: Backfill fixtures A/B/R with `evidenceStrength` + `drivers`

**Files:**
- Modify: `src/context/fixtures.ts` (scenario A `fixtureContextGraph:128`, B `fixtureContextGraphB:311`, R `fixtureContextGraphR:583`)
- Test: `src/context/fixtures-probabilistic.test.ts`

**Interfaces:**
- Consumes: `runProbabilistic` (Task 2/3), `integrity` (engine), the three fixtures.
- Produces: each fixture assumption gains `evidenceStrength`; each graph gains a `drivers` array (2–3 drivers, loadings on the assumptions that genuinely share a factor). For Scenario A (collapses), wire a driver so its collapse is correlated (sharper demo).

Implementer notes:
- Add `evidenceStrength` to every `type: "assumption"` node (thesis/claims untouched). Choose per the node's existing `evidence` array: ≥2 supporting → `strong`; a contradicting stance or no evidence → `weak`; else `moderate`.
- Drivers must reference REAL assumption ids from that fixture. Keep ≤5, loadings 0..1.
- The deterministic `integrity()` of each fixture MUST be unchanged (only additive fields) — assert it.

- [ ] **Step 1: Write the failing test** — `src/context/fixtures-probabilistic.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureContextGraphB, fixtureContextGraphR } from "./fixtures";
import { runProbabilistic } from "@/engine/probabilistic";

describe("fixtures carry probabilistic inputs", () => {
  for (const [name, g] of [["A", fixtureContextGraph], ["B", fixtureContextGraphB], ["R", fixtureContextGraphR]] as const) {
    it(`${name} has evidenceStrength on every assumption + at least one driver`, () => {
      const assumptions = g.nodes.filter((n) => n.type === "assumption");
      expect(assumptions.every((a) => a.evidenceStrength)).toBe(true);
      expect((g.drivers ?? []).length).toBeGreaterThan(0);
    });
    it(`${name} runs the probabilistic solver to a valid result`, () => {
      const r = runProbabilistic(g, { seed: 1, samples: 1000 });
      expect(r.pHold).toBeGreaterThanOrEqual(0);
      expect(r.pHold).toBeLessThanOrEqual(1);
      expect(r.keystoneDrivers.length).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/context/fixtures-probabilistic.test.ts`
Expected: FAIL — missing `evidenceStrength`/`drivers`.

- [ ] **Step 3: Edit fixtures** — add `evidenceStrength` to each assumption and a `drivers: [...]` to each of the three graphs (real ids). Keep all existing fields intact.

- [ ] **Step 4: Run new + existing fixture/integrity tests + typecheck**

Run: `npx vitest run src/context && npx tsc --noEmit`
Expected: PASS — including any existing deterministic-integrity assertions (proves engine path unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/context/fixtures.ts src/context/fixtures-probabilistic.test.ts
git commit -m "feat(fixtures): backfill A/B/R with evidenceStrength + latent drivers"
```

---

### Task 6: Store wiring — compute + expose the probabilistic result

**Files:**
- Modify: `src/store/useKeystone.ts` (`KeystoneState:61`; solve paths at `applyContextAndSolve`/`applyLoad` ~317-344, `applyLoad`/timeline ~415-458; selectors ~473)
- Modify: `src/llm/client.ts` OR `src/app/KeystoneApp.tsx` — call `generateDrivers` in the live extract flow and attach to the graph (drivers ride on `baseGraph`). For fixtures, drivers already present (Task 5).
- Test: `src/store/probabilistic-store.test.ts`

**Interfaces:**
- Consumes: `runProbabilistic` (Task 2/3), `ProbabilisticResult` (Task 1).
- Produces:
  - `KeystoneState.probabilistic: ProbabilisticResult | null` (recomputed wherever `workingGraph` is set from a solve).
  - `selectProbabilistic(s): ProbabilisticResult | null`.

Implementer notes:
- Wherever the store currently sets `workingGraph` from a solve (`applyContextAndSolve`, `applyLoad`, `setTimelineDay`), also set `probabilistic: runProbabilistic(workingGraph)`. `runProbabilistic` is pure + seeded → no hydration risk, but only call it in the store action (not in render).
- Initialize `probabilistic: null`; reset it to `null` in `reset`/`clearLoad` paths.
- Keep the existing deterministic selectors (`selectIntegrity` etc.) — they are the "sketch" preview.

- [ ] **Step 1: Write the failing test** — `src/store/probabilistic-store.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { createKeystoneStore, selectProbabilistic } from "./useKeystone";
import { fixtureContextGraph, fixtureContextAttacks } from "@/context/fixtures";

describe("store exposes probabilistic result after a solve", () => {
  it("is null before load and populated after", () => {
    const store = createKeystoneStore();
    store.getState().setGraph(fixtureContextGraph);
    expect(selectProbabilistic(store.getState())).toBeNull();
    store.getState().applyLoad(fixtureContextAttacks); // use the real solve action name in this store
    const p = selectProbabilistic(store.getState());
    expect(p).not.toBeNull();
    expect(p!.pHold).toBeGreaterThanOrEqual(0);
  });
});
```

(Implementer: adjust `setGraph`/`applyLoad` to the actual action names present in `useKeystone.ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/store/probabilistic-store.test.ts`
Expected: FAIL — `selectProbabilistic` undefined.

- [ ] **Step 3: Implement** the state field, the `runProbabilistic` calls in each solve action, resets, and the selector. Wire `generateDrivers` into the live extract flow so custom runs get drivers (fixtures already have them).

- [ ] **Step 4: Run store + full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (full suite green); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/store/useKeystone.ts src/llm/client.ts src/app/KeystoneApp.tsx src/store/probabilistic-store.test.ts
git commit -m "feat(store): compute + expose probabilistic result on solve"
```

---

### Task 7: UI — integrity band, variance-keystone, driver clusters + owed fixes

**Files:**
- Modify: `src/ui/tabs/GraphTab.tsx` (DETAIL default → true + redesigned panel; group nodes by dominant driver + legend), `src/canvas/KeystoneCanvas.tsx` / `src/canvas/StructuralNode.tsx` (edge styling + overflow-into-side-panes fix), `src/ui/primitives.tsx` (integrity gauge shows `P(hold)` + band), `src/ui/tabs/StressTab.tsx` (variance-driver keystone + correlated co-failure sentence)
- Modify: `src/ui/theme.css` (any new tokens/classes; keep disjoint blocks)
- Test: extend the nearest existing tab test; Playwright screenshot verification

**Interfaces:**
- Consumes: `selectProbabilistic` (Task 6).

Implementer notes (scale to the ledger aesthetic; substance over polish):
- **Integrity gauge:** render `P(hold)` as the headline (e.g. `HOLDS 68%`) with the `[p05–p95]` integrity band as a secondary hairline range under the existing integrity number. Do not remove the deterministic integrity — label it the "sketch"/point value.
- **Variance keystone:** in the STRESS rail, replace/augment the knock-out keystone caption with the top `keystoneDrivers[0]` ("Most load-bearing factor: <label>") and a co-failure sentence from `coFailure` ("If it slips, these fall together: …"). Keep the deterministic keystone visible as secondary.
- **Driver clusters:** color/tag assumption nodes by dominant driver (from `clusters`); add a compact driver legend. This is the cluster seed for the later zoom pass — grouping + legend only now.
- **Owed fixes:** set the GraphTab DETAIL default to `true` and redesign the detail panel so it doesn't look crammed; fix connection-line styling and the edges overflowing into side panes (constrain edge/SVG layer to the canvas bounds; verify at 390px and desktop).

- [ ] **Step 1: Write/extend a failing test** — assert the DETAIL panel is shown by default and the gauge renders a `P(hold)` string when `probabilistic` is present. Follow the existing GraphTab test setup.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement** the gauge band, variance-keystone + co-failure copy, driver clustering + legend, DETAIL default+redesign, and the edge styling/overflow fix.

- [ ] **Step 4: Verify** — tests, typecheck, and screenshots.

Run: `npx vitest run && npx tsc --noEmit`
Then, only for visual check: `NEXT_DIST_DIR=.next-agent npx next dev -p 3002` and capture GRAPH + STRESS at desktop (1280) and mobile (390). Confirm: DETAIL on by default and legible, no edges bleeding into side panes, `P(hold)`+band visible, driver legend present. Revert any `tsconfig.json`/`next-env.d.ts` pollution (`git checkout -- tsconfig.json next-env.d.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/ui/tabs/GraphTab.tsx src/ui/tabs/StressTab.tsx src/ui/primitives.tsx src/canvas/KeystoneCanvas.tsx src/canvas/StructuralNode.tsx src/ui/theme.css
git commit -m "feat(ui): P(hold) band, variance keystone, driver clusters; DETAIL default + edge fix"
```

---

## Self-Review

**Spec coverage:**
- §3.1 data model → Task 1. §3.2 sampling model → Task 2. §3.3 analytics (Sobol keystone, co-failure, clusters) → Task 3. §3.4 seeded reproducibility → Tasks 1–2. §4 LLM `evidenceStrength`/`emit_drivers` + fixtures → Tasks 4, 5. §6 UI (band, variance keystone, clusters, owed DETAIL/edge fixes) → Task 7. Store integration → Task 6. §5 Phase 2 calibration → intentionally deferred (not in this plan).
- §7 tests: seeded determinism (T1,T2), zero-limit anchor (T2 + T5 integrity-unchanged), correlation raises joint failure (T2), sensitivity sanity (T3) — all present.

**Placeholder scan:** numeric core (T1–T3) is complete code. T4–T7 give exact schemas/algorithms/copy + the pattern to mirror (`generateAttacks`) and exact files/anchors; no "add error handling"-style hand-waving — fallback behavior (`[]` on no-key) is specified.

**Type consistency:** `runProbabilistic(graph, {samples, seed})`, `ProbabilisticResult` fields (`pHold`, `mean`, `band`, `samples`, `keystoneDrivers{ id,label,sensitivity }`, `keystoneAssumptions{ id,influence }`, `clusters{ driverId,label,assumptionIds,variance,loadBearing }`, `coFailure{ driverId,label,assumptionIds }`), `Driver{ id,label,loadings{ assumptionId,loading } }`, `EvidenceStrength`, `SPREAD_BY_STRENGTH`, `selectProbabilistic` — used identically across Tasks 1–7.

**Open item for implementer:** Task 6 test uses placeholder action names (`setGraph`/`applyLoad`) — bind to the real action names in `useKeystone.ts` (e.g. `applyContextAndSolve`) when writing the test.
