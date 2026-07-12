# Contextual Analysis Council (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the keyword-match context reweight with a server-side **council of context agents** (weighting, contextual stress, skeptic debate, critic) that reason from the gathered context + evidence to reshape the analysis — feeding the existing engine + probabilistic solver + Phase-2 calibration, all untouched.

**Architecture:** New `src/agents/council/**` (server-only). Each member is a `structuredCall` (forced tool + zod), `hasApiKey()`-gated, fixture-fallback, never-throw — mirroring `generateAttacks`. A runner fans the members out in parallel, a critic grounds the result, and `POST /api/council` exposes it. The store consumes `CouncilResult.contextualAttacks` at the single "context-meets-engine" solve point; the UI surfaces the context-keystone + fracture + hidden assumptions.

**Tech Stack:** Next.js 15 API routes, `@anthropic-ai/sdk` via `structuredCall`, zod, Supabase auth, vitest, TypeScript.

## Global Constraints

- **Engine + probabilistic + calibrate math OFF-LIMITS** (`src/engine/**`). The council feeds *attacks* + an overlay; it never edits propagation/sensitivity/load/cascade/probabilistic/calibrate.
- **Server-only.** Everything under `src/agents/council/**` and `/api/council` is server-side. Client-reachable files (`src/store/**`, `"use client"`) must NOT value-import `@/agents/*`, `@/llm/*`, `@/context/compile`, `@/lib/supabase/server|admin`, or secrets — enforced by the boundary tests. The client only ever holds the `CouncilResult` JSON.
- **Never throw / never 500 / fixture-fallback.** Every live LLM call is `hasApiKey()`-gated and wrapped so any failure returns a fixture. `POST /api/council` catches everything → clean JSON.
- **No `Date.now`/`Math.random`/`new Date(`** reachable from a `"use client"` file. Council fixtures are static/deterministic.
- **Attack severity envelope** stays `[0.15, 0.55]` (raw severity alone must not collapse the structure — matches `generateAttacks`).
- Preserve fixture provenance (`source: "live" | "fixture"`), the ledger aesthetic, and the existing keyword reweight as the offline/no-council fallback (existing behavior byte-identical when no live council).
- vitest + `tsc --noEmit` green each task; quote zsh bracket paths; never `git add` `tsconfig.json`/`next-env.d.ts`.

**Dependency order:** T1 → T2/T3/T4 (agents, independent) → T5 (critic) → T6 (runner+route, needs T2-T5) → T7 (store/pipeline) → T8 (UI). Sequential.

---

### Task 1: Council types + `fixtureCouncil`

**Files:** Create `src/agents/council/types.ts`, `src/agents/council/fixtures.ts`; Test `src/agents/council/fixtures.test.ts`

**Interfaces (produce):**
```ts
export interface NodeWeighting { nodeId: string; contextWeight: number; rationale: string; evidenceRefs: string[] }
export interface HiddenAssumption { label: string; why: string; evidenceRefs: string[] }
export interface CouncilResult {
  nodeWeights: NodeWeighting[];
  contextKeystoneId: string | null;
  contextualAttacks: import("@/engine").Attack[];
  hiddenAssumptions: HiddenAssumption[];
  fractureNarrative: string;
  grounded: boolean;
  source: "live" | "fixture";
}
export function fixtureCouncil(scenario: "A" | "B" | "R"): CouncilResult;
```
`fixtureCouncil` returns a hand-authored, evidence-grounded result per scenario, referencing REAL node ids + attack targets from `src/context/fixtures.ts` (import the fixture graphs to get ids). Deterministic (no Date/random). `source: "fixture"`, `grounded: true`. `contextKeystoneId` should differ from the topological keystone in at least scenario A (to demo the "context changes the spine" story). `contextualAttacks` severities in `[0.15, 0.55]`.

- [ ] **Step 1: Write the failing test** — assert `fixtureCouncil("A"/"B"/"R")` returns a `CouncilResult` whose `contextualAttacks` all target real node ids of that fixture graph and have severity in `[0.15, 0.55]`, `nodeWeights` reference real node ids, `contextWeight ∈ [0,1]`, `grounded === true`, `source === "fixture"`, and A's `contextKeystoneId` is non-null.
- [ ] **Step 2: Run to verify failure** — `npx vitest run src/agents/council/fixtures.test.ts` → FAIL (no module).
- [ ] **Step 3: Implement** `types.ts` + `fixtures.ts` (three hand-authored results, ids cross-checked against `fixtureContextGraph()/B()/R()`).
- [ ] **Step 4: Run tests + tsc** — `npx vitest run src/agents/council && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add src/agents/council/types.ts src/agents/council/fixtures.ts src/agents/council/fixtures.test.ts && git commit -m "feat(council): types + offline fixtureCouncil (A/B/R)"`

---

### Task 2: Weighting agent (`weighContext`)

**Files:** Create `src/agents/council/weigh.ts`, `src/llm/council-schemas.ts` (or extend `src/llm/schemas.ts`); Test `src/agents/council/weigh.test.ts`

**Interfaces:**
- Consumes: `structuredCall`, `hasApiKey` (`src/llm/structured.ts`); `retryOnce` (`src/agents/retry.ts`); `Graph` (`@/engine`); `DecisionContextPack`, `CompanyContext` (`@/context`); `NodeWeighting`, `fixtureCouncil` (T1).
- Produces: `weighContext(graph, pack, company, findings, apiKey?): Promise<{ nodeWeights: NodeWeighting[]; contextKeystoneId: string | null }>` — `[]`/`null` fallback via `fixtureCouncil` on no-key/any error.

Implementer notes — **mirror `generateAttacks`/`generateAttacksWithSource` (`src/llm/client.ts:273-321`) exactly** for the gate + `retryOnce` + catch→fixture discipline. Add a zod `WeightingSchema` = `{ nodeWeights: [{ nodeId, contextWeight: number, rationale: string, evidenceRefs: string[] }], contextKeystoneId: string | null }`. Prompt (`emit_weighting`): "Given this decision's structure + the company's situation (constraints, objectives, known risks, timeline) + the gathered findings, judge how LOAD-BEARING each node is FOR THIS SITUATION (0..1) — not generic importance. Name the context-keystone: the one node whose failure most collapses the decision GIVEN this situation. Every rationale must cite a specific finding (evidenceRefs). Ground in the pack; do not invent facts." Validate; clamp `contextWeight` to `[0,1]`; drop weightings whose `nodeId` isn't in the graph; on no-key/failure return `fixtureCouncil(...)`'s `nodeWeights`/`contextKeystoneId` (pick scenario by `pack`/graph, default "A").

- [ ] **Step 1: Write the failing test** — `weighContext(fixtureContextGraph(), <pack>, <company>, [])` with no API key returns `nodeWeights` (array, all `nodeId` in graph, `contextWeight ∈ [0,1]`) and a `contextKeystoneId` in the graph or null, without throwing.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** `WeightingSchema` + `weighContext` (mirror generateAttacks). 
- [ ] **Step 4: tests + tsc + boundary** — `npx vitest run src/agents src/llm && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(council): SALC-style contextual weighting agent`

---

### Task 3: Contextual stress agent (`stressContext`)

**Files:** Create `src/agents/council/stress.ts`; extend `council-schemas.ts`; Test `src/agents/council/stress.test.ts`

**Interfaces:** `stressContext(graph, pack, company, findings, apiKey?): Promise<Attack[]>` — situation-specific attacks; `[]`/fixture fallback.

Implementer notes — mirror `generateAttacks`. Reuse the existing `AttacksSchema` (`src/llm/schemas.ts`) if it fits `Attack[]`; else a `ContextStressSchema`. Prompt (`emit_context_stress`): "Generate the failure modes THIS company actually faces — grounded in its real competitors, timeline, constraints, and the findings — not generic attack categories. Each targets a real assumption/claim id, `category` is a short slug, `severity ∈ [0.15, 0.55]`, `rationale` cites a finding." Validate: clamp severity to `[0.15, 0.55]`, drop attacks whose `targetId` isn't in the graph, cap count (e.g. ≤8). No-key/failure → `fixtureCouncil(...).contextualAttacks`.

- [ ] **Step 1: Failing test** — no-key `stressContext` returns `Attack[]` with every `targetId` in the graph and every `severity ∈ [0.15,0.55]`, no throw.
- [ ] **Step 2–5:** verify-fail → implement → `npx vitest run src/agents src/llm && npx tsc --noEmit` → commit `feat(council): contextual stress agent (situation-specific attacks)`

---

### Task 4: Skeptic debate (`debateSkeptic`)

**Files:** Create `src/agents/council/debate.ts` (may reuse helpers from `src/agents/tunnel.ts`); extend `council-schemas.ts`; Test `src/agents/council/debate.test.ts`

**Interfaces:** `debateSkeptic(graph, pack, findings, apiKey?): Promise<{ hiddenAssumptions: HiddenAssumption[]; fractureNarrative: string }>` — fixture fallback.

Implementer notes — model a grounded proposer-vs-skeptic exchange. Simplest robust form (no multi-turn needed for v1): ONE `structuredCall` `emit_skeptic` that instructs the model to first argue FOR the decision, then attack it as a skeptic, and output the 1–2 **unstated assumptions** the situation hides + a one-sentence **fracture narrative** ("your Series-A timeline makes X the real fracture point"). Schema `SkepticSchema = { hiddenAssumptions: [{ label, why, evidenceRefs }], fractureNarrative: string }`. Every hidden assumption cites a finding. (If reusing `tunnel.ts`'s two-agent exchange is cleaner, do so — but keep it to a bounded number of calls.) No-key/failure → `fixtureCouncil(...)`'s `hiddenAssumptions`/`fractureNarrative`.

- [ ] **Step 1: Failing test** — no-key returns `{ hiddenAssumptions: HiddenAssumption[], fractureNarrative: string }` (array, non-throwing; fractureNarrative a non-empty string from the fixture).
- [ ] **Step 2–5:** verify-fail → implement → tests+tsc → commit `feat(council): grounded skeptic debate (hidden assumptions + fracture)`

---

### Task 5: Critic / grounding gate (`critique`)

**Files:** Create `src/agents/council/critique.ts`; Test `src/agents/council/critique.test.ts`

**Interfaces:** 
```ts
export interface CouncilDraft { nodeWeights: NodeWeighting[]; contextKeystoneId: string | null;
  contextualAttacks: Attack[]; hiddenAssumptions: HiddenAssumption[]; fractureNarrative: string }
export function critique(draft: CouncilDraft, findingKeys: Set<string>): { result: Omit<CouncilResult,"source">; }
```
Deterministic grounding gate (pure — testable, no LLM): an item is **grounded** iff its `evidenceRefs` are non-empty AND at least one ref resolves in `findingKeys` (the set of valid finding identifiers/sources from the gathered findings). Rules:
- Drop `nodeWeights` / `hiddenAssumptions` with no resolving evidenceRef.
- Keep `contextualAttacks` (attacks carry a rationale, not refs) but **downgrade** severity by ×0.85 for any attack whose rationale doesn't mention a known finding token (soft signal), clamped to `[0.15,0.55]`.
- `grounded` (whole result) = at least one nodeWeight OR hiddenAssumption survived AND `contextKeystoneId` (if set) survived in the kept `nodeWeights`; else `grounded=false` and the caller degrades to the deterministic view.
- Never throws; empty draft → `grounded:false`, empty arrays.

(Documented extension, out of scope v1: an LLM deep-verify that checks each surviving claim is actually *entailed* by its cited finding.)

- [ ] **Step 1: Failing test** — construct a draft with one grounded + one ungrounded (empty/dangling refs) nodeWeighting; assert the ungrounded one is dropped, the grounded kept; assert `grounded===false` when everything is ungrounded; assert an attack with an unknown-finding rationale is downgraded ×0.85 (clamped).
- [ ] **Step 2–5:** verify-fail → implement → `npx vitest run src/agents/council && npx tsc --noEmit` → commit `feat(council): deterministic grounding critic (epistemic gate)`

---

### Task 6: Runner + `POST /api/council`

**Files:** Create `src/agents/council/index.ts` (`runCouncil`), `src/app/api/council/route.ts`; Test `src/agents/council/run.test.ts`

**Interfaces:**
- `runCouncil(input: { graph: Graph; pack: DecisionContextPack; company: CompanyContext; findings: Finding[]; apiKey?: string }): Promise<CouncilResult>` — runs `weighContext` ∥ `stressContext` ∥ `debateSkeptic` (via `Promise.all`, each already fixture-safe), builds `findingKeys` from `findings`, runs `critique`, returns `CouncilResult` with `source` = "live" if `hasApiKey()` else "fixture". Whole-runner catch → `fixtureCouncil(...)`.
- `POST /api/council` — auth (`createServerSupabase` / `getUser`; 401 if none — the client falls back to `fixtureCouncil` when unauth/offline, like the calibration route), body `{ graph, pack, company, findings }`, returns `{ council: CouncilResult }`; never 500 (catch → `{ council: fixtureCouncil(...) }` or clean error).

- [ ] **Step 1: Failing test** — `runCouncil` with no API key returns a `CouncilResult` (`source:"fixture"`, `contextualAttacks` target real ids, `grounded` boolean), non-throwing; a member throwing (inject by passing a graph that makes one member fixture-fallback) still yields a whole result.
- [ ] **Step 2–5:** verify-fail → implement → `npx vitest run && npx tsc --noEmit` (full — route touches server) → commit `feat(council): parallel runner + /api/council route`

---

### Task 7: Store + pipeline wiring

**Files:** Modify `src/store/useKeystone.ts` (council state + consume `contextualAttacks` at solve), `src/app/KeystoneApp.tsx` (call `/api/council` after extract; guest → `fixtureCouncil`), `src/lib/library/council-client.ts` (create: `fetchCouncil(input, isGuest)` mirroring `fetchCalibration`); Test `src/store/council-store.test.ts`

**Interfaces:**
- `KeystoneState.council: CouncilResult | null` + `setCouncil` + `selectCouncil`.
- At the store's "context meets engine" solve point (`useKeystone.ts:~396` and the sibling solve actions), when `council` is present AND `council.source==="live"` AND `council.contextualAttacks.length>0`, use `council.contextualAttacks` as the `effective` attacks (still passed through `applyAttacks`); otherwise keep `reweightAttacksByContext(...)` (byte-identical fallback). Keep this pure/boundary-clean — `CouncilResult` is plain data; do NOT import `@/agents/*` into the store (import the TYPE only from `@/agents/council/types`).
- `fetchCouncil` lives in `src/lib/library/` (client-reachable) — fetch `/api/council` (server does the LLM), fixture fallback for guest/failure. NO `@/agents/*` value import (type-only OK).

- [ ] **Step 1: Failing test** — `setCouncil(fixtureCouncil("A"))` then `selectCouncil` returns it; after a solve with a live council set, the effective attacks equal `council.contextualAttacks` (assert via the stored `attacks`/`rawAttacks`), and with no council the solve still uses `reweightAttacksByContext` (unchanged).
- [ ] **Step 2–5:** verify-fail → implement → `npx vitest run && npx tsc --noEmit` + `npx vitest run src/store/boundary.test.ts` → commit `feat(store): consume contextual council attacks + overlay`

---

### Task 8: UI — surface the contextual reasoning

**Files:** Modify `src/ui/tabs/StressTab.tsx` and/or `GraphTab.tsx` (context-keystone + fracture + hidden assumptions block), `src/canvas/StructuralNode.tsx` (per-node rationale on selection), `src/ui/theme.css` if needed; Test extend a tab test; Playwright screenshot.

**Interfaces:** Consumes `selectCouncil`. Fuse with calibration: the displayed contextual verdict runs the Phase-2 `applyCalibration` on top where a calibrated number is shown.

Implementer notes (ledger aesthetic; substance over polish):
- When `council` present + `grounded`: a compact **"WHAT THE COUNCIL FOUND"** block in the STRESS/verdict rail — the `fractureNarrative`, and if `contextKeystoneId` ≠ the topological keystone, "Given your situation, the real spine is **<label>** — <rationale>"; then the 1–2 `hiddenAssumptions` (label + why).
- On node selection, show that node's `contextWeight` + `rationale` (from `nodeWeights`) in the SELECTION panel.
- When `!grounded` or no council → render today's view unchanged (deterministic), no contextual claims.

- [ ] **Step 1: Failing test** — with a `council` (fixture A) in the store, the rail renders the `fractureNarrative` string and a context-keystone line; with `grounded:false`, neither appears.
- [ ] **Step 2–4:** verify-fail → implement → `npx vitest run && npx tsc --noEmit`; then isolated `:3002` screenshot (ANALYSE → APPLY LOAD) confirming the council block renders; revert tsconfig/next-env pollution.
- [ ] **Step 5: Commit** — `feat(ui): surface context-keystone, fracture + hidden assumptions`

---

## Self-Review

**Spec coverage:** §3.1 members → T2,T3,T4,T5. §3.2 types + fixture → T1. §3.3 runner/route/store/solve/calibration-fusion → T6,T7,T8. §3.4 UI → T8. §4 grounding (critic) → T5; fixture-fallback → every task; boundary → T2-T8 constraints. §5 tests present per task.

**Placeholder scan:** the novel deterministic parts (T1 fixture, T5 critic, T6 runner, T7 solve-swap) are concretely specified; the four agent calls give the exact mirror pattern (`generateAttacks`), the zod schema shape, the prompt requirements, and a no-key fixture-fallback test — no "add an agent" hand-waving.

**Type consistency:** `CouncilResult`/`NodeWeighting`/`HiddenAssumption`/`CouncilDraft`, `weighContext`/`stressContext`/`debateSkeptic`/`critique`/`runCouncil`/`fetchCouncil`/`fixtureCouncil`, store `council`/`setCouncil`/`selectCouncil` — consistent across T1-T8. `contextualAttacks` reuse `@/engine` `Attack` (severity `[0.15,0.55]`).

**Boundary:** council is `src/agents/council/**` (server); the store/client import only the `CouncilResult` **type**; `fetchCouncil` calls the route. Called out in T2-T8 and tested by the existing boundary suites.

**Engine freeze:** council feeds `applyAttacks` (existing) + overlay; no `src/engine/**` edits in any task (self-review checkpoint at T6/T7).
