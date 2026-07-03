# Keystone — Context Layer Execution Plan

**Investigated:** 2026-07-03 · Repo `null-hackathon` (branch `main`, remote `github.com/Ahmedk-n/null-hackathon`)
**Scope:** Add the Business / Technical / Temporal Context Layer in front of graph generation.

> **Headline finding from repo inspection:** the repo is **greenfield**. There is **no application code yet** — no `package.json`, no `src/`, no Next.js app, no engine, no components. The repo contains only `docs/`: the design spec and a **complete, task-by-task base-build plan** (`docs/superpowers/plans/2026-07-03-keystone.md`, 1,812 lines) that specifies the entire base app down to exact file paths, TypeScript types, function signatures, and code. This plan therefore does two things: (1) treats that base plan as the **contract for the architecture that will exist**, and (2) layers the context work onto it so the two are built together without conflict.

---

## 1. Repo Understanding

### 1.1 Actual tree (verified, everything under git)

```
null-hackathon/
├── .git/
└── docs/
    └── superpowers/
        ├── plans/
        │   └── 2026-07-03-keystone.md            # 1,812-line base build plan (Tasks 1–14, real code)
        └── specs/
            ├── 2026-07-03-keystone-design.md      # design spec (== "message (2).txt")
            ├── keystone-example-graph.svg         # hero graph, healthy state (87% integrity)
            └── keystone-example-graph-collapsed.svg # hero graph, post-load (34%, keystone shattered)
```

There is **nothing else**. `find` for `package.json`, lockfiles, `tsconfig*`, `next.config*`, `.env*`, `vitest*`, `jest*` returns empty. No `node_modules`, no `.next`, no `src`.

### 1.2 File-by-file

| Path | What it is | Relevant to context layer? | Modify? | Leave? |
|---|---|---|---|---|
| `docs/.../plans/2026-07-03-keystone.md` | The base build plan. Defines Next.js 15 + React 19 + TS app: `src/engine/` (pure solver), `src/llm/` (Claude wrappers + fixture), `src/store/useKeystone.ts` (Zustand), `src/canvas/` (React Flow + Dagre), `src/ui/`, `src/app/` (App Router + API routes). Gives **exact code** for every file. | **Critical reference** — it is the architecture. | Extend (add context tasks; touch 4 seams). | Keep as the base contract. |
| `docs/.../specs/2026-07-03-keystone-design.md` | Design spec: engine math (support propagation, knock-out sensitivity, cascade), LLM's 3 jobs, data flow, demo script, safety net. | Context — establishes the "LLM proposes, code decides" boundary the context layer must respect. | No. | Keep. |
| `docs/.../specs/keystone-example-graph.svg` | Visual reference for the healthy hero graph. Shows node styling, keystone red-glow, integrity gauge, load-path edges. | Yes — the target look; context panel must fit this dark CAD aesthetic (`#0d1117` bg, blue thesis / teal claim / grey assumption / red keystone). | No. | Keep. |
| `docs/.../specs/keystone-example-graph-collapsed.svg` | Post-load collapsed state: buckled thesis, failed claims tilt/dim, keystone shattered, gauge craters 87%→34%. | Yes — the collapse animation target. | No. | Keep. |

### 1.3 Conventions the base plan locks in (the context layer MUST match these)

- **Root layout is `src/`** with `@/*` → `./src/*` path alias (tsconfig).
- **Store file is `src/store/useKeystone.ts`** (NOT `useKeystoneStore.ts` as the context brief proposed) — vanilla `createStore` + singleton `keystoneStore` + `useKeystone(selector)` hook.
- **Engine lives in `src/engine/`** with files `types.ts`, `propagation.ts`, `sensitivity.ts`, `load.ts`, `index.ts` (NOT `graph.ts/evaluate.ts/applyLoad.ts/cascade.ts` from the context brief).
- **`Attack.category` is a free `string`**, not an enum. This matters for weight-adjustment mapping (see §4.4).
- **LLM calls use `client.messages.parse()` + `output_config: { format: zodOutputFormat(schema) }`**, `max_tokens: 16000`, no `thinking`, no prefill, no `budget_tokens`. Model id **exactly** `claude-opus-4-8`.
- **Every LLM wrapper falls back to a fixture on any error/no-key and never throws.** `hasApiKey()` gates the network.
- **Tests are vitest**, colocated `*.test.ts`, node environment, `@` alias.
- **Engine is pure**: no imports from `llm/`, `canvas/`, `ui/`, React, or Next.

> **Reconciliation note:** the context brief ("message (3)") proposed `context/`, `store/useKeystoneStore.ts`, `engine/graph.ts`, `canvas/nodes/AssumptionNode.tsx`, etc. Those names **do not match** the base plan that will actually be built. This plan **follows the base plan's conventions** and places the new layer at **`src/context/`**. Wherever the brief and the base plan disagree, the base plan wins.

---

## 2. Current Architecture Assessment

Because the repo is greenfield, **every runtime component is MISSING** — but almost all are **fully specified** in the base plan, so building them is low-risk mechanical work, not design work. I use a third mark, **SPEC'D**, to capture "not built, but exact code exists in the base plan."

| Component | Status | Evidence / implication |
|---|---|---|
| Graph model (`Graph`, `GraphNode`, `DepGroup`, `Attack`) | **MISSING · SPEC'D** | Base plan Task 2 gives exact `src/engine/types.ts`. Build verbatim. |
| Support-propagation engine | **MISSING · SPEC'D** | Task 2 `propagation.ts` (topo sort, AND=product, OR=max, `integrity`). |
| Sensitivity / keystone ranking | **MISSING · SPEC'D** | Task 3 `sensitivity.ts` (`rankLoadBearing`, `keystone`, `cloneGraph`). |
| Failure / cascade logic | **MISSING · PARTIAL SPEC'D** | Task 4 `load.ts` gives `applyAttacks` + `detectFailures` (threshold flag). The spec's richer AND/OR **cascade** rule (§4.5) is described but **not implemented** in the plan — only threshold-based failure. Implication: cascade visuals derive from `detectFailures`; true cascade propagation is an optional engine add. |
| React Flow canvas | **MISSING · SPEC'D** | Tasks 9,11: `layout.ts` (Dagre), `StructuralNode.tsx`, `KeystoneCanvas.tsx`. |
| Graph nodes | **MISSING · SPEC'D** | Single `StructuralNode` component (not per-type files). |
| Zustand store | **MISSING · SPEC'D** | Task 8 `src/store/useKeystone.ts`. |
| API routes | **MISSING · SPEC'D** | Tasks 7,14: `/api/extract`, `/api/attacks`, `/api/reinforce`. **No `/api/context`** — that is new. |
| Claude / Anthropic integration | **MISSING · SPEC'D** | Task 6 `src/llm/client.ts` (`extractStructure`, `generateAttacks`). |
| Schema validation (zod) | **MISSING · SPEC'D** | Task 5 `src/llm/schemas.ts` (`GraphSchema`, `AttacksSchema`). **Context schemas are new.** |
| Context panel / context layer | **MISSING · NOT SPEC'D** | **This is the entirely new surface.** No context files, types, route, or UI exist anywhere. |
| Demo fixtures | **MISSING · SPEC'D (base) / NEW (context)** | Task 5 `src/llm/fixture.ts` (graph + attacks). **Context fixtures are new.** |
| Tests | **MISSING · SPEC'D** | Every base task ships vitest tests. Context tests are new. |

**Implications.**
1. **Build order is real, not assumed.** The context layer sits on top of engine + llm + store + api + canvas, none of which exist. The founder split (§10) therefore covers **base + context together**, not context in isolation.
2. **The four integration seams the context layer touches are all additive and low-conflict:** (a) `extractStructure(decision, pack?)`, (b) `generateAttacks(graph, pack?)`, (c) the store gains context state, (d) the app gains context inputs + a Context Used panel. None require rewriting the engine.
3. **The engine never needs to change for context.** This is the cleanest possible boundary and we should protect it (§9).

---

## 3. Target Architecture

### 3.1 Flow (as specified, mapped to files)

```
ContextPanel (4 textareas: business, technical, temporal, decision)
        │  POST /api/context  { businessContextText, technicalContextText, temporalContextText, decisionText }
        ▼
  src/context/compile.ts  ──►  one Claude call (messages.parse + zodOutputFormat)
        │                        returns { companyContext, decisionContextPack }
        ▼
  CompanyContext JSON  +  DecisionContextPack JSON   (validated; fixture fallback)
        │  store.setContext(companyContext, decisionContextPack)
        │  render ContextUsedPanel  ◄── DecisionContextPack
        ▼
  POST /api/extract  { decision, pack: decisionContextPack }
        │  extractStructure(decision, pack) → Graph            (LLM proposes structure)
        ▼
  store.setGraph(graph)  ──►  ENGINE computes support, integrity, keystone   (code decides)
        │
        │  user clicks "Apply Load"
        ▼
  POST /api/attacks  { graph, pack: decisionContextPack }
        │  generateAttacks(graph, pack) → Attack[]             (LLM proposes attacks + severities)
        │  [optional pure] reweightAttacksByContext(attacks, pack.contextWeightAdjustments)
        ▼
  store.applyLoad(attacks)  ──►  ENGINE recomputes failure/collapse/keystone  (code decides)
        ▼
  Canvas animates collapse · IntegrityGauge craters · Keystone highlighted · ContextUsedPanel explains why
```

### 3.2 Files to add / modify

**NEW — context module (`src/context/`)** — owned by Founder A:
```
src/context/
  types.ts        # CompanyContext, DecisionContextPack, all sub-types (§4)
  schemas.ts      # zod mirrors of types.ts + combined ContextCompileSchema
  compile.ts      # compileContext(input) → { companyContext, decisionContextPack }; fixture fallback
  weights.ts      # PURE, engine-adjacent: reweightAttacksByContext(attacks, adjustments)
  fixtures.ts     # HERO_CONTEXT_INPUT, fixtureCompanyContext(), fixtureDecisionContextPack()
  index.ts        # barrel
  compile.test.ts
  weights.test.ts
  fixtures.test.ts
```

**NEW — API route** — owned by Founder B (thin; imports Founder A's `compile`):
```
src/app/api/context/route.ts          # POST → { companyContext, decisionContextPack }
src/app/api/context/route.test.ts
```

**NEW — UI** — owned by Founder B:
```
src/ui/ContextPanel.tsx               # 4 inputs + "Analyse" button
src/ui/ContextUsedPanel.tsx           # renders DecisionContextPack
```

**MODIFY — small, well-scoped seams:**
```
src/llm/client.ts        # extractStructure(text, pack?) ; generateAttacks(graph, pack?)  [Founder A signatures, Founder B call-sites]
src/llm/schemas.ts       # unchanged shapes (only touched if attacks ever gain a WeightCategory field — default: no change)
src/app/api/extract/route.ts   # accept optional { pack } and forward
src/app/api/attacks/route.ts   # accept optional { pack } and forward
src/store/useKeystone.ts # + companyContext, decisionContextPack state; + setContext(); pass pack through
src/app/KeystoneApp.tsx  # mount ContextPanel + ContextUsedPanel; "Analyse" orchestrates context→extract
```

**UNTOUCHED (hard boundary):** `src/engine/*` — never imports context, never receives a `DecisionContextPack`. `weights.ts` is the *only* deterministic context code, and it lives in `src/context/`, transforming `Attack[]→Attack[]` **before** the engine sees them (§9).

### 3.3 Why `src/context/` and not `context/`

The base plan uses `src/` + `@/*` alias. Placing the module at `src/context/` keeps imports uniform (`@/context`) and lets it sit beside `@/engine`, `@/llm`, `@/store`. A top-level `context/` would break the alias and the tsconfig `include`.

---

## 4. Data Contracts

All context types live in **`src/context/types.ts`** and are re-exported from `src/context/index.ts`. Zod mirrors live in **`src/context/schemas.ts`** (the API route and `compile.ts` validate with these; UI and store import the inferred TS types). This gives one source of truth shared by route ⇄ llm wrapper ⇄ store ⇄ UI, exactly like the base plan shares `Graph`/`Attack` from `@/engine`.

Design rules: **strict, no `any`**; every 0..1 score is documented and clamped; optional scalars use `?`; arrays default to `[]` (never optional-array, to avoid `undefined.map` in the UI); ids are plain `string`.

```ts
// src/context/types.ts

/* ---------- Raw input from the four textareas ---------- */
export interface ContextInput {
  businessContextText: string;
  technicalContextText: string;
  temporalContextText: string;
  decisionText: string;
}

/* ---------- Business ---------- */
export interface BusinessContext {
  companyStage?: string;          // e.g. "seed", "Series A", "growth"
  industry?: string;
  customers: string[];            // segments; [] if unknown
  revenueModel?: string;
  competitors: string[];
  strategicGoals: string[];
  growthBottlenecks: string[];
  marketConstraints: string[];    // brief adds this under "business context"
}

/* ---------- Technical ---------- */
export interface TechnicalContext {
  stack: string[];
  architecture?: string;
  infrastructure: string[];
  integrations: string[];
  deploymentProcess?: string;
  observability?: string;
  teamSize?: number;              // integer ≥ 0
  technicalDebt: string[];
  engineeringConstraints: string[];
}

/* ---------- Temporal ---------- */
export type UpcomingEventType =
  | "investor_meeting" | "customer_call" | "board_update"
  | "architecture_review" | "incident_review" | "launch"
  | "hiring_deadline" | "fundraising_deadline" | "other";

export interface UpcomingEvent {
  id: string;
  type: UpcomingEventType;
  title: string;
  dateDescription: string;        // natural language, e.g. "tomorrow", "next Tuesday"
  relevanceToDecision: string;
  importance: number;             // 0..1
}

export interface Deadline {
  id: string;
  title: string;
  dateDescription: string;
  consequenceIfMissed: string;
  severity: number;               // 0..1
}

export interface TemporalContext {
  upcomingEvents: UpcomingEvent[];
  deadlines: Deadline[];
  urgencyLevel: number;           // 0..1 overall near-term pressure
}

/* ---------- Cross-cutting ---------- */
export type ConstraintType = "time" | "budget" | "team" | "technical" | "market" | "regulatory";
export interface Constraint {
  id: string;
  type: ConstraintType;
  statement: string;
  severity: number;               // 0..1
}

export interface Objective {
  id: string;
  statement: string;
  priority: number;               // 0..1
}

export type RiskCategory = "market" | "execution" | "technical" | "competitor" | "opportunity_cost";
export interface KnownRisk {
  id: string;
  category: RiskCategory;
  statement: string;
  likelihood: number;             // 0..1
  severity: number;               // 0..1
}

/* ---------- The compiled company model ---------- */
export interface CompanyContext {
  business: BusinessContext;
  technical: TechnicalContext;
  temporal: TemporalContext;
  constraints: Constraint[];
  objectives: Objective[];
  knownRisks: KnownRisk[];
  missingInfo: string[];          // what the model could NOT infer from the inputs
}

/* ---------- Weight adjustments (the important output) ---------- */
export type WeightCategory =
  | "market" | "execution" | "technical" | "competitor"
  | "opportunity_cost" | "timeline" | "reliability" | "auditability";

export interface ContextWeightAdjustment {
  targetCategory: WeightCategory;
  direction: "increase" | "decrease";
  magnitude: number;              // 0..1, how strongly context shifts this category
  reason: string;                 // one sentence, shown in Context Used panel
}

/* ---------- The decision-specific pack (grounds extraction) ---------- */
export interface DecisionContextPack {
  decision: string;

  relevantBusinessFacts: string[];
  relevantTechnicalFacts: string[];
  relevantTemporalFacts: string[];

  relevantConstraints: Constraint[];
  relevantObjectives: Objective[];
  relevantKnownRisks: KnownRisk[];

  contextWeightAdjustments: ContextWeightAdjustment[];
  missingInformation: string[];
}

/* ---------- What the pure compiler returns (no transport concerns) ---------- */
export interface ContextCompileResult {
  companyContext: CompanyContext;
  decisionContextPack: DecisionContextPack;
}

/* ---------- What POST /api/context returns over the wire ---------- */
// The route wraps the compiler output with a provenance flag so the UI can show
// a "demo fallback" chip. `source` is set by the ROUTE (live vs fixture), never
// by `compileContext` (which stays a pure {companyContext, decisionContextPack}).
export interface ContextRouteResponse extends ContextCompileResult {
  source: "live" | "fixture";
}
```

### 4.1 Zod schemas (`src/context/schemas.ts`)

Mirror every interface with `z.object`, `z.enum`, `z.number()`, `z.string()`, `z.array(...)`. Clamp scores **after** parse (zod validates shape; a `postClamp()` helper enforces 0..1 and `teamSize ≥ 0` because a hard `.min(0).max(1)` refusal would trigger the fallback instead of tolerating a slightly-off model value). Export `CompanyContextSchema`, `DecisionContextPackSchema`, and the **combined** `ContextCompileSchema = z.object({ companyContext, decisionContextPack })` used for the single structured-output call.

```ts
export const ContextCompileSchema = z.object({
  companyContext: CompanyContextSchema,
  decisionContextPack: DecisionContextPackSchema,
});
export type ContextCompileOutput = z.infer<typeof ContextCompileSchema>;
```

> **Naming discipline (one shape, two names):** `ContextCompileResult` (hand-written TS, §4) and `ContextCompileOutput` (`z.infer` of the schema, here) describe the **same** object and must stay structurally identical — exactly as §4.3 mandates for the sub-types. `compileContext` is typed to return `ContextCompileResult`; the zod parse yields `ContextCompileOutput`; a `satisfies`/round-trip test asserts they are assignable both ways so drift fails the build. Do **not** introduce a third name.

### 4.2 Where each type is used

| Type | Route | llm wrapper | store | UI |
|---|---|---|---|---|
| `ContextInput` | request body of `/api/context` | input to `compileContext` | — | `ContextPanel` local state |
| `CompanyContext` | response | `compileContext` output | `state.companyContext` | (debug only) |
| `DecisionContextPack` | response; body of `/extract`,`/attacks` | input to `extractStructure`/`generateAttacks` | `state.decisionContextPack` | `ContextUsedPanel` |
| `ContextWeightAdjustment` | inside pack | prompt input + `reweightAttacksByContext` | inside pack | "How this changed the analysis" list |

### 4.3 Shared-type discipline

- **Never** duplicate these interfaces. The store, UI, route, and llm wrapper all `import type { DecisionContextPack } from "@/context"`.
- The route validates with the **zod** schema; everything downstream trusts the **TS** type. This is the base plan's exact pattern (`GraphSchema` at the boundary, `Graph` everywhere else).

### 4.4 Reconciling `WeightCategory` (8 values) with `Attack.category` (free string)

The engine's `Attack.category` is a free `string` (base plan Task 2). `ContextWeightAdjustment.targetCategory` is an 8-value enum. To let weight adjustments deterministically influence attack severity we need a mapping. **Default (recommended, zero engine change):** keep `Attack.category` free; `src/context/weights.ts` owns a keyword→`WeightCategory` normaliser:

```ts
const CATEGORY_KEYWORDS: Record<WeightCategory, string[]> = {
  execution: ["execution", "delivery", "operate", "migrate", "second-order", "second order"],
  market: ["market", "demand", "customer", "adoption"],
  technical: ["technical", "architecture", "infra", "observability", "scaling"],
  competitor: ["competitor", "incumbent", "rival"],
  opportunity_cost: ["opportunity", "instead", "not doing", "focus"],
  timeline: ["timeline", "deadline", "schedule", "near-term"],
  reliability: ["reliability", "uptime", "sla", "resilience"],
  auditability: ["audit", "compliance", "traceability", "regulatory"],
};

// Deterministic, total, pure. Lower-cases raw, returns the first WeightCategory whose
// keyword list matches a substring; null if none. (base fixtureAttacks() uses the free
// category "second-order" — mapped to execution above so a real hero attack is classifiable.)
export function normaliseCategory(raw: string): WeightCategory | null { /* first keyword hit, else null */ }
```

**The join (the whole contract, so it is implementable):**
```ts
const K = 0.5; // tuning constant

export function reweightAttacksByContext(
  attacks: Attack[],
  adjustments: ContextWeightAdjustment[],
): Attack[] {
  return attacks.map((atk) => {
    const cat = normaliseCategory(atk.category);
    if (cat === null) return atk;                       // unclassifiable → unchanged
    const matches = adjustments.filter((w) => w.targetCategory === cat);
    if (matches.length === 0) return atk;               // no adjustment for this category → unchanged
    const w = matches.reduce((a, b) => (b.magnitude > a.magnitude ? b : a)); // tie-break: strongest magnitude
    const sign = w.direction === "increase" ? 1 : -1;
    const severity = clamp01(atk.severity * (1 + sign * K * w.magnitude));
    return { ...atk, severity };                         // returns a NEW attack; never mutates
  });
}
```

Rules made explicit: **unclassifiable category → unchanged; no matching adjustment → unchanged; multiple adjustments for one category → highest `magnitude` wins; severity clamped to `[0,1]`; input never mutated.** `clamp01` is re-implemented locally in `src/context/` (not imported from `@/engine`) to keep the boundary one-directional. This keeps the boundary clean and needs no change to `@/engine`. (Alternative, only if we want stronger coupling: have the LLM emit an optional `weightCategory: WeightCategory` on each `Attack`; that would edit `Attack` in `src/engine/types.ts` — avoid for the hackathon to keep the engine frozen.)

---

## 5. LLM Integration Plan

### 5.1 Call-count decision — **recommended: ONE context call, then the existing two**

The whole demo does **at most three sequential Claude calls, split across two user actions**:

- **"Analyse" (build) → 2 calls:**
  1. `POST /api/context` — inputs: 4 texts → **one** Claude call producing **both** `companyContext` and `decisionContextPack` via the combined `ContextCompileSchema`.
  2. `POST /api/extract` — inputs: `decision` + `decisionContextPack` → `Graph`.
- **"Apply Load" (later beat) → 1 call:** `POST /api/attacks` — `graph` + `decisionContextPack` → `Attack[]`.

**Why compile CompanyContext + DecisionContextPack in ONE call, not two:**
- Compiling the company model and then selecting the decision-relevant slice is a **single coherent reasoning task**; Opus does it well in one pass. Splitting doubles latency and doubles the malformed-JSON failure surface for zero demo benefit.
- One fixture covers both on fallback; one schema to validate; one retry path.
- The two conceptual steps (`compileCompanyContext`, `buildDecisionContextPack`) still exist as **prompt sections** (§6.1, §6.2) inside the one call's system prompt, and as **separate pure fixtures** for testing — so we keep the mental model without paying for two round-trips.

**Why NOT one giant call (context+extract+attacks together):**
- We *want* the Context Used panel to render **before** the graph assembles (a strong demo beat: "here's what it understood about you," *then* the structure builds). Separate calls make that trivial.
- Attack generation is a **distinct later user action** ("Apply Load"), so folding it into build is wrong UX and wastes tokens if the user tunes sliders first.
- A single mega-schema is the highest malformed-JSON risk of all options.

> If, during rehearsal, the combined context call proves flaky, the fallback is trivial: split `compile.ts` into `compileCompanyContext()` then `buildDecisionContextPack(companyContext, decision)` as two sequential calls. The function boundary is designed to allow this without touching the route or UI.

### 5.2 Server-side contract

**`POST /api/context`** — new route, mirrors the base plan's route style.
```ts
// request  (ContextInput)
{ businessContextText: string; technicalContextText: string; temporalContextText: string; decisionText: string }
// response (ContextRouteResponse = ContextCompileResult & { source })
{ companyContext: CompanyContext; decisionContextPack: DecisionContextPack; source: "live" | "fixture" }
```
The route calls `compileContext(input)` (which returns `ContextCompileResult`) and adds `source` itself, based on whether the live model answered or the fixture fallback fired.

**`POST /api/extract`** (modified, additive):
```ts
{ decision: string; pack?: DecisionContextPack } → Graph
```

**`POST /api/attacks`** (modified, additive):
```ts
{ graph: Graph; pack?: DecisionContextPack } → { attacks: Attack[] }
```

`pack` is **optional** on both so the base app still works before the context layer lands and so tests stay green during integration.

### 5.3 `src/context/compile.ts` (mirrors `src/llm/client.ts` exactly)

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ContextInput, ContextCompileResult } from "./types";
import { ContextCompileSchema } from "./schemas";
import { fixtureCompanyContext, fixtureDecisionContextPack } from "./fixtures";

const MODEL = "claude-opus-4-8";
function hasApiKey() { return Boolean(process.env.ANTHROPIC_API_KEY); }

export async function compileContext(input: ContextInput): Promise<ContextCompileResult> {
  const fallback = () => ({
    companyContext: fixtureCompanyContext(),
    decisionContextPack: fixtureDecisionContextPack(input.decisionText || undefined),
  });
  if (!hasApiKey()) return fallback();
  const run = async () => {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: CONTEXT_SYSTEM,            // §6.1 + §6.2 combined
      messages: [{ role: "user", content: renderContextUser(input) }],
      output_config: { format: zodOutputFormat(ContextCompileSchema) },
    });
    const parsed = res.parsed_output as ContextCompileResult | null;
    if (!parsed) throw new Error("no parsed_output");
    return parsed;
  };
  try { return postClamp(await run()); }            // retry once on any failure
  catch { try { return postClamp(await run()); } catch { return fallback(); } }
}
```

Requirements satisfied: key server-side only (route + `compile.ts` run on the server; `ANTHROPIC_API_KEY` never imported client-side), structured JSON via `zodOutputFormat`, **retry once**, deterministic fixture fallback, no freeform `JSON.parse`, and a UI error flag surfaced through the store (§7).

### 5.4 Error state to UI

`compileContext` never throws; on total failure it returns the fixture. To surface that honestly, have `compileContext` return `{ ...result, usedFixture: boolean }` internally, or (simpler) have the **route** detect the fallback and stamp `source` on the `ContextRouteResponse` (add the same `source` field to `/extract` and `/attacks` responses). The store keeps `contextSource: "live" | "fixture"`; `ContextUsedPanel` shows a small "⚠ demo fallback" chip when `fixture`. This makes failures visible without ever breaking the demo. `source` lives **only** on the route-response type, never on the pure `ContextCompileResult`.

---

## 6. Prompt Design for Claude API

All prompts are **system prompts** paired with a rendered user message; all use `zodOutputFormat` so the model must return schema-valid JSON (no "return only JSON" theatre needed, but we still instruct it for robustness). Shared preamble injected into every context prompt:

> **GROUNDING RULES (in every prompt):** Use only the business, technical, and temporal context provided. **Do not invent facts** that are not supported by the input. When something needed is not stated, add it to `missingInfo`/`missingInformation` rather than guessing. Keep every string concise (≤ 20 words) so it fits a compact UI. Produce **company-specific** items, not generic best-practice. Return only data matching the schema.

### 6.1 `compileCompanyContext` (system prompt section A)

```
You are Keystone's context compiler. Convert three free-text descriptions of a company —
business, technical, and temporal — into one structured CompanyContext object.

For BUSINESS: extract companyStage, industry, customers[], revenueModel, competitors[],
strategicGoals[], growthBottlenecks[], marketConstraints[]. Omit optional scalars you cannot
support from the text; use [] for empty lists.

For TECHNICAL: extract stack[], architecture, infrastructure[], integrations[],
deploymentProcess, observability, teamSize (integer), technicalDebt[], engineeringConstraints[].

For TEMPORAL: extract upcomingEvents[] (each: type from the allowed enum, title, dateDescription
verbatim from the user like "tomorrow", relevanceToDecision, importance 0..1),
deadlines[] (title, dateDescription, consequenceIfMissed, severity 0..1), and an overall
urgencyLevel 0..1 reflecting near-term time pressure.

Also derive constraints[], objectives[], and knownRisks[] that are explicitly implied by the text.
Every score is 0..1. List anything you genuinely could not determine in missingInfo[].
Do not invent numbers, customers, or deadlines that are not in the input.
```

### 6.2 `buildDecisionContextPack` (system prompt section B — same call)

```
Given the CompanyContext you just built and the DECISION the user is weighing, produce a
DecisionContextPack that grounds the decision analysis.

Select only the facts RELEVANT to this specific decision:
relevantBusinessFacts[], relevantTechnicalFacts[], relevantTemporalFacts[] — short sentences,
each traceable to the input. Carry over the relevant constraints[], objectives[], knownRisks[].

Then produce contextWeightAdjustments[] — THE MOST IMPORTANT OUTPUT. Each adjustment says how the
context shifts the importance of one analysis category:
targetCategory ∈ {market, execution, technical, competitor, opportunity_cost, timeline,
reliability, auditability}; direction increase|decrease; magnitude 0..1; and a one-sentence reason.

Temporal context is decisive here: an imminent event (e.g. a customer meeting tomorrow) should
INCREASE weight on timeline, execution, reliability, and auditability, and may DECREASE the
attractiveness of large, slow, risky changes in the short term. Make the reason reference the
specific event or deadline.

Put anything the analysis still needs but the context did not provide into missingInformation[].
Do not fabricate; if the context is thin, say so in missingInformation[] and keep adjustments modest.
```

The **user message** renders the four inputs verbatim under labelled headers, e.g.:
```
BUSINESS CONTEXT:
<businessContextText>

TECHNICAL CONTEXT:
<technicalContextText>

TEMPORAL CONTEXT / UPCOMING COMMITMENTS:
<temporalContextText>

DECISION:
<decisionText>
```

### 6.3 `extractStructure` **with context** (modifies base plan's `EXTRACT_SYSTEM`)

Keep the base plan's structure rules (thesis/claim/assumption, AND/OR groups, confidences, ≤8-word labels), then append:

```
GROUND THE STRUCTURE IN CONTEXT. You are given a DecisionContextPack: relevant business,
technical, and temporal facts, plus contextWeightAdjustments. Make the assumptions COMPANY-SPECIFIC,
not generic. Prefer assumptions that the provided facts actually stress. When temporal context
raises timeline/execution/reliability/auditability weight, surface assumptions about near-term
delivery, operational readiness, and credibility (e.g. "The team can explain a staged migration
plan before the customer meeting", "The current system meets enterprise reliability now",
"We have enough observability to run distributed services"). Set an assumption's initial confidence
LOWER when the context suggests it is fragile. Do not invent facts absent from the pack; you may
still propose reasonable structural assumptions, but label them from the company's reality.
```

User message: base decision text **plus** a compact rendering of the pack (relevant facts bulleted + the weight adjustments as `category: direction magnitude — reason`).

### 6.4 `generateAttacks` **with context** (modifies base plan's `ATTACK_SYSTEM`)

Keep the base rules (one strongest realistic attack per assumption; category, severity 0..1, one-line rationale; load types), then append:

```
USE THE CONTEXT WEIGHT ADJUSTMENTS. You are given contextWeightAdjustments and the relevant
temporal facts. Raise severity on attacks whose category matches an INCREASED weight (especially
execution, timeline, reliability, auditability when a near-term event looms), and make the rationale
reference the specific temporal pressure (e.g. "...before tomorrow's enterprise customer meeting").
Lower severity where a decreased weight applies. Keep severities honest — the strongest realistic
attack, not the most dramatic. Every attack must target an assumption id that exists in the graph.
```

User message: the assumption summary (as in the base plan) **plus** the weight adjustments and the top relevant temporal facts.

### 6.5 (Optional) `suggestReinforcement` **with context** (modifies base `reinforce.ts` SYSTEM)

Keep the base rule (one concrete, cheap validation for the keystone), then append:

```
Tailor the suggestion to the company's near-term reality. If a temporal event is imminent, propose
what to prove or prepare BEFORE that event (e.g. "Draft a one-page staged-migration timeline with
rollback and audit-log plan to bring to tomorrow's meeting"). Reference the specific event/deadline.
One or two sentences.
```

---

## 7. UI / UX Plan

### 7.1 Layout (extends the base plan's two-pane `KeystoneApp`)

The base app is a `360px` left rail + canvas. The context layer adds a **pre-flight step** and a **Context Used** card in the rail. Recommended arrangement:

```
┌───────────────────────────────────────────────────────────────────────────┐
│  KEYSTONE                                        [STRUCTURAL INTEGRITY gauge]│
├──────────────── left rail (scroll) ─────────────┬──────── canvas ───────────┤
│  ▸ CONTEXT  (collapsible, open before analysis) │                            │
│    Business context     [textarea]              │   KeystoneCanvas           │
│    Technical context    [textarea]              │   (empty state before      │
│    Temporal context     [textarea]              │    Analyse)                │
│    Decision             [textarea]              │                            │
│    [ Analyse ]  ← runs /api/context → /api/extract                          │
│                                                 │                            │
│  ▸ CONTEXT USED  (appears after Analyse)        │                            │
│    Business facts · Technical facts · Temporal  │                            │
│    How this changed the analysis                │                            │
│    Missing information         [⚠ demo fallback]│                            │
│                                                 │                            │
│  ▸ ASSUMPTIONS  (sliders, from base plan)       │                            │
│  ▸ LOAD  (Apply Load + attack cards, base plan) │                            │
│  ▸ REINFORCE  (stretch, base plan)              │                            │
└─────────────────────────────────────────────────┴────────────────────────────┘
```

The 11 required elements map as: (1–3) three context textareas + (4) decision textarea in `ContextPanel`; (5) **Analyse** button; (6) `ContextUsedPanel`; (7) `KeystoneCanvas`; (8) `IntegrityGauge`; (9) `LoadPanel` attack cards; (10) keystone highlight (red node + glow, from base `StructuralNode`); (11) `ReinforcementPanel` (stretch).

### 7.2 `ContextPanel.tsx`

Four labelled textareas + a single **Analyse** button. Local `useState` for the four strings (pre-filled with the hero fixture text so a judge can hit Analyse instantly). On click it calls the store action `analyse(input)`, toggling a `building` flag, and collapses itself once analysis completes (keeps the rail tidy for the collapse demo).

> **Key-safety (hard rule):** `analyse()` runs in the **client bundle** (the store and `KeystoneApp` are `"use client"`). It must reach the model **only over HTTP** — `await fetch("/api/context", …)` then `await fetch("/api/extract", …)` — and must **never** `import { compileContext }` from `@/context/compile` or anything from `@/llm/client` or `@anthropic-ai/sdk`. Those server modules (which do `new Anthropic()` and read `process.env.ANTHROPIC_API_KEY`) are imported **only** by the route files under `src/app/api/**`. Importing `compileContext` into the store would pull the SDK + key-reading code into the browser bundle. This is enforced by a static guard test (§9).

### 7.3 `ContextUsedPanel.tsx` — bound directly to `DecisionContextPack`

```tsx
export function ContextUsedPanel({ pack, source }: { pack: DecisionContextPack; source: "live" | "fixture" }) {
  return (
    <section>
      <Header>CONTEXT USED {source === "fixture" && <Chip>⚠ demo fallback</Chip>}</Header>
      <FactList title="Business facts"  items={pack.relevantBusinessFacts} />
      <FactList title="Technical facts" items={pack.relevantTechnicalFacts} />
      <FactList title="Temporal facts"  items={pack.relevantTemporalFacts} accent="amber" />
      <div>
        <Header>How this changed the analysis</Header>
        {pack.contextWeightAdjustments
          .slice().sort((a,b)=>b.magnitude-a.magnitude)
          .map(w => (
            <WeightRow key={w.targetCategory+w.reason}
              arrow={w.direction === "increase" ? "▲" : "▼"}
              color={w.direction === "increase" ? "#f59e0b" : "#8b98a5"}>
              {w.direction === "increase" ? "Increased" : "Decreased"} weight on {label(w.targetCategory)} — {w.reason}
            </WeightRow>
          ))}
      </div>
      {pack.missingInformation.length > 0 &&
        <FactList title="Missing information" items={pack.missingInformation} muted />}
    </section>
  );
}
```

Every field is a **direct read** of the pack — no transformation, so the panel is provably "what grounded the graph." The weight rows sorted by magnitude put the temporal-driven increases at the top, matching the spec's example ("increased weight on execution risk / reliability / auditability").

### 7.4 Impressive-but-not-overbuilt

- **Sequence the reveal:** Context Used panel fades in first (~1s), *then* the graph assembles node-by-node. Judges see the reasoning before the structure. Cheap with `motion` stagger.
- **Highlight the causal link:** when a weight row is `increase` on `execution`/`reliability`, briefly pulse the matching assumption node(s) in the canvas (shared category tag). One `useEffect` + a transient highlight in the store. High wow, ~30 min.
- **Pre-fill the hero inputs** so the demo starts one click in.
- **Don't build:** live document upload, per-field structured forms, editable CompanyContext JSON viewer, or multi-decision history. Four textareas + one read-only panel is enough.

---

## 8. Adaptive Visual Dimensionality Plan

The base plan implements **`pickLayoutMode(nodeCount)`** (≤8 `simple-2d` / ≤25 `layered-2-5d` / else `clustered-zoom`) and **`layoutPositions`** via Dagre (`rankdir: "BT"`), but **only actually renders the shared layered view** — it explicitly defers real `simple-2d` and `clustered-zoom` behaviour as "a talking point, not a demo beat." React Flow **is** the canvas. So positions are already computed by Dagre; dimensionality is a **styling/interaction layer on top of the same positions**.

Recommended implementation (all within the existing `KeystoneCanvas` + `StructuralNode`, no new library):

> **Band math vs the fixture — reconciled.** `pickLayoutMode(8)` returns `simple-2d` (Band 1). The **base** `fixtureGraph()` has exactly 8 nodes, so it is Band 1. The **context-hero** fixture (`fixtureContextGraph()`, §13) is deliberately built with **9 nodes** (it adds the grounded staged-migration / observability / auditability assumptions), so it genuinely lands in **Band 2** (`layered-2-5d`) — that is *why* the context layer, not the base app, is what shows off the 2.5D collapse. The two fixtures are different graphs (see §13); nothing about the base 8-node graph is claimed to be Band 2.

**Band 1 — 1–8 nodes · simple 2D.** Use Dagre positions as-is. Flat node styling (no elevation), straight/bezier edges, `fitView`. This is essentially the base render; nothing extra to build. (The base demo lives here.)

**Band 2 — 9–25 nodes · layered 2.5D (the context-hero band; the 9-node microservices context graph lives here).** Same Dagre BT positions, but add **depth cues driven by rank/type** so the structure reads as a load-bearing assembly:
- **Elevation by layer:** thesis on top, claims mid, assumptions foundation. Map node `type` → a `z` pseudo-depth: assumptions `z=0`, claims `z=1`, thesis `z=2`. Apply `transform: perspective(800px) translateZ()` **or**, more robustly in React Flow, fake it with `scale` + `box-shadow` + `filter: brightness()`: deeper layers slightly larger and brighter, foundation slightly recessed (lower opacity, longer shadow). Purely CSS on `StructuralNode`, keyed off `data.type`.
- **Shadow/elevation:** `boxShadow` grows with layer; the keystone keeps its red glow.
- **Stress animation (framer-motion, already a dep):** on `Apply Load`, failed nodes get `rotate` + `y` drop + `opacity` fade (base plan already does a mild version); amplify for 2.5D — stagger the collapse **bottom-up** (assumption cracks → claim tilts → thesis buckles) using `transition.delay` by rank, matching the collapsed SVG (thesis rotates −2°, claims tilt ±7–9°, keystone shatters with crack polylines).
- **Crack overlay:** the SVGs draw crack polylines on failed nodes; port that as an absolutely-positioned `<svg>` inside `StructuralNode` shown when `isFailed`/`isKeystone`.

**Band 3 — 26+ nodes · clustered zoom.** Group nodes by a **cluster key** and render group containers, expand on click:
- Cluster key = the risk/opportunity dimension: `market | execution | technical | competitor | opportunity_cost | timeline | reliability | auditability` (same 8 as `WeightCategory`). Derive each node's cluster from the attack categories targeting it, or a light keyword pass on its label (reuse `normaliseCategory`).
- Compute cluster centroids from member Dagre positions; render React Flow **group nodes** (parent nodes with `extent: "parent"`), collapsed by default showing count + worst integrity; click expands. Use React Flow's built-in sub-flow/group support — no new lib.
- This band is **unlikely to appear in the hero demo** (the context-hero fixture is 9 nodes → Band 2). Build it only if time remains; otherwise `pickLayoutMode` returning `clustered-zoom` can fall back to the layered render (as the base plan already does) and the clustering is a talking point.

**Position computation summary:** always Dagre (`@dagrejs/dagre`, `rankdir:"BT"`, `ranksep:90`, `nodesep:40`) from the existing `layoutPositions`. Dimensionality changes **only** node styling, stagger timing, and (band 3) grouping — never the x/y solve. This keeps it deterministic and testable (`layout.test.ts` already asserts thesis-above-assumptions).

**Priority:** fully build Band 2 (it's the demo). Band 1 is free. Band 3 is stretch.

---

## 9. Deterministic Engine Integration (the boundary)

**Invariant:** `src/engine/*` never imports from `src/context/`, `src/llm/`, `src/ui/`, React, or Next, and **no engine function ever receives a `DecisionContextPack` or `CompanyContext`.** The engine's public surface stays exactly as the base plan defines it:

```
computeSupport(graph) · integrity(graph) · rankLoadBearing(graph) · keystone(graph)
applyAttacks(graph, attacks) · detectFailures(graph)
```

Context influences the analysis through **exactly two channels, both outside the engine:**

1. **LLM prompt grounding (LLM proposes).** `decisionContextPack` is fed to `extractStructure` and `generateAttacks` prompts. The LLM proposes *company-specific graph structure, initial confidences, attacks, and severities*. It does **not** compute anything.

2. **One pure deterministic transform (code decides, still not the engine).** `src/context/weights.ts::reweightAttacksByContext(attacks, adjustments): Attack[]` deterministically nudges attack **severity** by category match **before** the attacks enter the engine:
   ```ts
   // pure, no engine import; maps free category → WeightCategory, then adjusts severity, clamped 0..1
   severity' = clamp01(severity * (1 + sign(direction) * K * magnitude))   // K ≈ 0.5
   ```
   The engine then runs **unchanged** on the reweighted attacks: `applyAttacks` → `detectFailures` → `keystone`/`rankLoadBearing`/`integrity`. So structural integrity, support propagation, collapse, and keystone ranking remain 100% deterministic engine outputs.

**What the LLM must NOT decide (enforced by architecture):** the keystone, structural integrity, which nodes fail, the collapse set. These are only ever `keystone()`, `integrity()`, `detectFailures()` outputs. The LLM has no code path to set them — the store computes them via selectors (`selectIntegrity`, `selectKeystoneId`, `selectFailures`) from `@/engine`, and those selectors take `workingGraph` only.

**Two boundaries, two guard tests:**

1. **Engine purity** — `src/engine/boundary.test.ts` reads each `src/engine/*.ts` source and asserts it contains no `@/context` / `@/llm` / `react` / `next` import. (Cheap, catches accidental coupling in review.)
2. **Key/client safety** — `src/store/boundary.test.ts` (or a repo-root test) statically asserts that **no `"use client"` file and nothing under `src/store/**`** imports `@/context/compile`, `@/llm/client`, `@anthropic-ai/sdk`, or references `process.env.ANTHROPIC_API_KEY`. This is the automated guarantee that the API key cannot enter the browser bundle. (Grep the source strings; fail on any hit.)

**Where the boundary is enforced in code:**
- **Directory + imports:** context/llm/server-only code live in their own folders; the engine imports nothing from them, and the client (store, UI, `KeystoneApp`) reaches the model only via `fetch` to `src/app/api/**`.
- **Store seam:** `applyLoad(attacks)` runs `reweightAttacksByContext(attacks, pack.contextWeightAdjustments)` (the pure, fully-specified transform from §4.4) **inside the store action, before** calling engine `applyAttacks`. `reweightAttacksByContext` lives in `@/context` (pure data-in/data-out, no key, safe to bundle client-side); the compute lives in `@/engine`; the store is the only place they meet.
- **`reweightAttacksByContext` is feature-flagged** (`applyContextWeights: boolean`, default `true` but toggleable). If it ever misbehaves in rehearsal, flip it off and the demo still runs on raw LLM severities — the engine is unaffected either way.

---

## 10. Founder Work Split

Because the base app does not exist, the split covers **base + context together**. The cut line follows the base plan's natural seams so the two founders touch almost-disjoint files. **Founder A owns everything pure/deterministic/data-contract (engine + llm-core + context-core + fixtures + tests). Founder B owns everything product-facing (store wiring, API routes, canvas, UI, app, demo).**

### Founder A — "Core & Contracts"

- **Mission:** every deterministic, testable artifact — the solver, the data contracts, the context compiler logic, and the fixtures that make the demo bulletproof. Nothing renders; everything is unit-tested.
- **Owned files/dirs:**
  - `src/engine/**` (base Tasks 2–4: `types.ts`, `propagation.ts`, `sensitivity.ts`, `load.ts`, `index.ts`, tests, + new `boundary.test.ts`)
  - `src/llm/schemas.ts`, `src/llm/fixture.ts`, `src/llm/client.ts` (base Tasks 5–6), `src/llm/reinforce.ts` (stretch)
  - `src/context/**` (all new: `types.ts`, `schemas.ts`, `compile.ts`, `weights.ts`, `fixtures.ts`, `index.ts`, tests)
  - Scaffold ownership of `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.mjs`, `.env.local.example` (base Task 1) — created **first**, then frozen.
- **Exact tasks & order:**
  1. Base Task 1 scaffold → commit → **push immediately** (unblocks B).
  2. Engine (base Tasks 2–4) TDD.
  3. `src/context/types.ts` + `schemas.ts` (§4) → **push the types early**; B imports them.
  4. `src/llm/schemas.ts` + `fixture.ts` (base Task 5).
  5. `src/context/fixtures.ts` — hero `HERO_CONTEXT_INPUT`, `fixtureCompanyContext()`, `fixtureDecisionContextPack()`, **`fixtureContextGraph()` (9 nodes), `fixtureContextAttacks()`** (§13). **Do NOT edit `src/llm/fixture.ts`** — the context graph is a *separate* fixture with its own node ids so the base `a_arch` tests stay green.
  6. `src/context/compile.ts` (§5.3) + prompts (§6.1/6.2).
  7. `src/context/weights.ts` (`normaliseCategory`, `reweightAttacksByContext`) (§9).
  8. `src/llm/client.ts` with the **new signatures** `extractStructure(text, pack?)`, `generateAttacks(graph, pack?)` (§6.3/6.4) + `reinforce.ts` (stretch).
  9. `boundary.test.ts`.
- **Dependencies on B:** none inbound for steps 1–7. B consumes A's exports; A never imports B.
- **Expected outputs:** green `npm test`; a working `compileContext`, `extractStructure(pack)`, `generateAttacks(pack)`, `reweightAttacksByContext`, and a self-consistent 9-node context fixture whose keystone is strictly dominant and whose integrity craters ≈62%→≈3% under `fixtureContextAttacks()` (§13).
- **Tests to write:** engine (base) + `context/schemas` round-trip + clamp + `ContextCompileResult`↔`ContextCompileOutput` assignability; `compile` no-key fallback returns schema-valid pack; `weights` deterministic reweight (known input→known severities, incl. unclassifiable→unchanged and no-match→unchanged); `fixtures` validate + **pinned** context baseline integrity / keystone id (`k_credible`) / post-attack integrity; `boundary` no-cross-import (engine purity).
- **Risks:** context schema churn ripples to B. **Mitigation:** freeze `src/context/types.ts` by end of hour 2 and announce; additive-only after.
- **Fallback:** if `compile.ts` live call is flaky, ship the fixture path only — the demo still runs company-specific from `fixtures.ts`.

### Founder B — "Product & Integration"

- **Mission:** everything a judge sees — the context inputs, the Context Used panel, the canvas dimensionality, the store wiring, the API routes, and the demo flow.
- **Owned files/dirs:**
  - `src/store/useKeystone.ts` (base Task 8 + context state/actions)
  - `src/app/**` API routes: `api/extract/route.ts`, `api/attacks/route.ts` (base Task 7, + optional `pack`), **new** `api/context/route.ts`, `api/reinforce/route.ts` (stretch)
  - `src/canvas/**` (base Tasks 9,11: `layout.ts`, `StructuralNode.tsx`, `KeystoneCanvas.tsx`) + dimensionality (§8)
  - `src/ui/**`: `IntegrityGauge.tsx`, `ConfidenceSlider.tsx`, `LoadPanel.tsx` (base Tasks 10,12) + **new** `ContextPanel.tsx`, `ContextUsedPanel.tsx`
  - `src/app/page.tsx`, `src/app/KeystoneApp.tsx` (base Task 13)
- **Exact tasks & order:**
  1. Wait for A's scaffold push, `npm install`.
  2. Store (base Task 8) against `@/engine` — works with A's engine as soon as it lands.
  3. Canvas + UI primitives (base Tasks 9–12) using A's `fixture.ts` for local data.
  4. `api/extract` + `api/attacks` routes (base Task 7), then wire `KeystoneApp` (base Task 13) — **full base demo runs here**, before context.
  5. **Context additions:** `ContextPanel.tsx`, `api/context/route.ts` (imports A's `compileContext`), extend store with `companyContext`/`decisionContextPack`/`contextSource` + `analyse()` action, `ContextUsedPanel.tsx`, mount both in `KeystoneApp`.
  6. Thread `pack` through `/extract` and `/attacks` call-sites; call `reweightAttacksByContext` in `applyLoad`.
  7. Dimensionality polish (§8 Band 2), reveal sequencing, hero pre-fill.
- **Dependencies on A:** engine types/`index` (step 2), `fixture.ts` (step 3), `context/types` (step 5), `compileContext`/`weights` (steps 5–6). All are **imports of A's stable exports** — no shared-file edits.
- **Expected outputs:** the running app; Analyse → Context Used renders → graph builds → Apply Load collapses → keystone highlighted; fallback-safe with no key.
- **Tests to write:** route tests (`context/route.test.ts` returns schema-valid `{companyContext, decisionContextPack, source}`, extend base `routes.test.ts` with `pack`), store test extension (`setContext`, `analyse` uses fixture with no key), **`src/store/boundary.test.ts`** (key/client-safety guard: no `"use client"`/`src/store/**` file imports `@/context/compile`, `@/llm/client`, `@anthropic-ai/sdk`, or references `process.env.ANTHROPIC_API_KEY` — §9), a manual demo checklist (§12).
- **Risks:** touching the same `KeystoneApp.tsx`/`useKeystone.ts` as base tasks. **Mitigation:** B owns both files end-to-end (A never touches them), so it is intra-founder sequencing, not a cross-founder conflict.
- **Fallback:** if context wiring slips, `KeystoneApp` still renders the base demo (context panel hidden behind a flag); Context Used can render straight from `fixtureDecisionContextPack()`.

### Shared-file conflict map (only files both *could* touch)

| File | Owner | Rule |
|---|---|---|
| `src/llm/client.ts` | **A** writes signatures + bodies | B only reads; if B needs a call-site tweak, it's in routes, not here |
| `src/llm/fixture.ts` | **A**, base | **Never edited by the context work** — the context hero is a *separate* `src/context/fixtures.ts::fixtureContextGraph()`; base `a_arch` tests stay green |
| `src/context/fixtures.ts` | **A** | New file, single owner; holds the 9-node context hero graph/attacks |
| `src/context/types.ts` | **A** | Frozen after hour 2; additive-only |
| `package.json` etc. | **A** | Created once, frozen; new deps go through A |
| `src/store/useKeystone.ts`, `src/app/KeystoneApp.tsx` | **B** | B owns both end-to-end (base + context edits) — intra-founder sequencing, not a cross-founder conflict |
| everything else | single owner | disjoint |

### Branch strategy

- `founder-a/context-core` — A's work.
- `founder-b/context-ui` — B's work.
- `integration/context-layer` — long-lived integration branch; **A pushes the scaffold + `src/context/types.ts` + `src/engine/index.ts` here first**, both founders branch from it.
- **Merge cadence:** (1) A merges scaffold + types to `integration` **within hour 2** (unblocks B). (2) Each founder merges to `integration` at the end of every base "phase" boundary (after engine, after llm, after routes) — small, frequent, tested merges. (3) Final context wiring merges last, once `analyse()` end-to-end passes with the fixture. Merge to `main` only after the manual demo checklist (§12) is green.

---

## 11. Implementation Timeline

Assume a compressed 2-day hackathon with two founders working in parallel. Each phase has explicit acceptance criteria.

**Phase 1 — Repo understanding, scaffold, contracts (≈ first 2–3 hrs).**
- A: scaffold (base Task 1) + `src/context/types.ts` + `schemas.ts` + engine types; push to `integration`.
- B: `npm install` from A's scaffold; **type/stub** the Zustand store against engine *types* (the store imports engine runtime fns — `integrity`, `keystone`, `applyAttacks`… — which are A's Phase-2 deliverable, so the store only **compiles** here; its functional tests are deferred to Phase 2).
- **Acceptance:** `npm test` green on scaffold + engine types; `src/context/types.ts` compiles and is imported by the store without error; store **type-checks** (functional store tests deferred to Phase 2, after A merges the engine); `tsconfig` `@` alias resolves.

**Phase 2 — Engine, llm-core, context compiler, base UI shell (Day 1).**
- A: engine (Tasks 2–4), `src/llm/schemas.ts`+`fixture.ts`, `src/context/fixtures.ts`, `compile.ts`, `weights.ts`.
- B: canvas + UI primitives + base routes (`/extract`, `/attacks`) + `ContextPanel` shell.
- **Acceptance:** engine unit tests all green (known graph → known integrity/keystone); `compileContext` with no key returns a schema-valid `{companyContext, decisionContextPack}` (fixture); the base app renders the hero fixture graph and gauge locally.

**Phase 3 — Integrate context into extraction/attacks + Context Used panel (Day 2 AM).**
- A: `extractStructure(pack)`, `generateAttacks(pack)` with the §6 prompts.
- B: `/api/context` route; store `setContext`/`analyse`; `ContextUsedPanel`; thread `pack`; call `reweightAttacksByContext` in `applyLoad`.
- **Acceptance:** clicking **Analyse** (no key) renders the Context Used panel from `fixtureDecisionContextPack`, then assembles the graph; with a key, live context changes the visible facts and weight rows. Engine still computes integrity/keystone (proven by store tests).

**Phase 4 — Collapse polish, fallback, rehearse (Day 2 PM).**
- B: Band-2 2.5D depth + staggered bottom-up collapse + crack overlay; reveal sequencing; hero pre-fill; `⚠ demo fallback` chip.
- Both: run the manual demo (§12) end-to-end **offline** (no key) and **online** (key). Freeze.
- **Acceptance:** the full hero script (§13) runs flawlessly with the network **off**; integrity craters from its **engine-computed baseline (≈62%) to ≈3%** on Apply Load (exact numbers pinned by the fixture test, §12 — *not* the mockup's 87/34); `c_roi` holds while the keystone + its two claims + thesis fail (partial collapse); keystone node red-glows and shatters; Context Used shows temporal facts and "increased weight on execution/reliability/auditability." Tag `main`.

---

## 12. Testing Plan

### Unit (vitest, no mocks where possible)

- **Engine determinism (base plan, highest value):** known graph → known `integrity`; known graph → known `keystone`/`rankLoadBearing` order; `applyAttacks` compounding; `detectFailures` threshold. These back the "real solver" claim.
- **Context schema validation:** `ContextCompileSchema.parse(fixture)` passes; a malformed object (bad enum, missing array) fails; `postClamp` forces scores into 0..1 and `teamSize ≥ 0`.
- **Context pack construction / fallback:** `compileContext(input)` with **no** `ANTHROPIC_API_KEY` returns schema-valid `{companyContext, decisionContextPack}` without throwing; `decisionContextPack.contextWeightAdjustments` is non-empty for the hero input.
- **Deterministic reweight:** `reweightAttacksByContext(knownAttacks, knownAdjustments)` → **exact** expected severities (pure function, unit-perfect); increasing `execution` weight strictly raises an execution attack's severity; clamped at 1.
- **Engine remains deterministic under context:** applying reweighted attacks to the hero graph still yields the same keystone id the engine picks; toggling the reweight flag changes severities but never the *code path* that computes the keystone.
- **Pinned context-hero fixture (replaces mockup gates):** `fixtureContextGraph()` validates against `GraphSchema`; `integrity` ≈ 61.97 (assert `toBeCloseTo(61.97, 1)`); `keystone(...)?.id === "k_credible"` and its impact ≥ 5× the next assumption's (strict dominance); after `applyAttacks(fixtureContextGraph(), fixtureContextAttacks())`, `integrity` < 10 and `detectFailures` contains `T`,`c_exec`,`c_reliab`,`k_credible` but **not** `c_roi`.
- **Boundary guards:** `src/engine/boundary.test.ts` asserts no `src/engine/*.ts` imports `@/context`/`@/llm`/`react`/`next`; `src/store/boundary.test.ts` asserts no `"use client"`/`src/store/**` file imports `@/context/compile`, `@/llm/client`, `@anthropic-ai/sdk`, or references `process.env.ANTHROPIC_API_KEY` (key-safety).
- **Graph extraction fallback:** `extractStructure("anything")` with no key returns the schema-valid fixture graph; `generateAttacks(graph)` no key returns fixture attacks.

### Integration (call handlers directly, no server — base plan pattern)

- **context input → context pack:** `POST /api/context` (fixture path) returns `{companyContext, decisionContextPack}` that validate against the schemas.
- **context pack → graph extraction:** `POST /api/extract` with `{ decision, pack }` returns a schema-valid `Graph`; the pack does not break the fixture fallback.
- **attack generation with context:** `POST /api/attacks` with `{ graph, pack }` returns schema-valid attacks.
- **failure fallback fixture:** with no key, the whole chain (`/context`→`/extract`→`/attacks`) returns valid data and never 500s.

### Manual demo test (the acceptance test)

Run the **microservices + enterprise-meeting-tomorrow** hero (§13), network **off**:
1. Context Used panel shows business facts (enterprise fintech, onboarding bottleneck, auditability/reliability), technical facts (FastAPI monolith, limited observability, no platform engineer), **temporal facts (meeting tomorrow; reliability/auditability/timeline focus)**.
2. "How this changed the analysis" lists increased weight on execution/timeline/reliability/auditability, each with a reason referencing tomorrow's meeting.
3. Graph includes staged-migration / observability / platform-maturity / enterprise-credibility assumptions.
4. Apply Load: attacks stress near-term execution; **integrity is computed by the engine** and craters; the keystone node highlights and cracks.
5. Verify the keystone is the near-term-credibility assumption (fixture is tuned so it is).

---

## 13. Fallback Strategy

The demo must never fail. Every LLM call already falls back to a fixture (base pattern). The **context layer adds pre-baked context fixtures** so the *entire* flow works offline.

**`src/context/fixtures.ts`:**
```ts
export const HERO_CONTEXT_INPUT: ContextInput = {
  businessContextText:
    "Enterprise fintech customers. Onboarding speed is our main growth bottleneck. Customers require auditability and reliability; we sell into regulated fintech teams.",
  technicalContextText:
    "FastAPI monolith. Limited observability. No dedicated platform engineer. A distributed architecture would raise operational complexity.",
  temporalContextText:
    "Major enterprise customer meeting tomorrow about reliability, auditability, and implementation timeline. We need a credible near-term technical plan.",
  decisionText: "Should we migrate to microservices?",
};

export function fixtureCompanyContext(): CompanyContext { /* fully populated, schema-valid */ }
export function fixtureDecisionContextPack(decision?: string): DecisionContextPack {
  return {
    decision: decision ?? HERO_CONTEXT_INPUT.decisionText,
    relevantBusinessFacts: [
      "Enterprise onboarding is the main growth bottleneck.",
      "Customers require auditability and reliability.",
      "Sells into regulated fintech teams.",
    ],
    relevantTechnicalFacts: [
      "Backend is a FastAPI monolith.",
      "Observability is limited.",
      "No dedicated platform engineer.",
      "Distributed architecture increases operational complexity.",
    ],
    relevantTemporalFacts: [
      "Major enterprise customer meeting tomorrow.",
      "Meeting focuses on reliability, auditability, and timeline.",
      "Team needs a credible near-term technical plan.",
    ],
    relevantConstraints: [/* time+regulatory */],
    relevantObjectives: [/* win the enterprise customer */],
    relevantKnownRisks: [/* execution, technical */],
    contextWeightAdjustments: [
      { targetCategory: "execution",    direction: "increase", magnitude: 0.8, reason: "A major customer meeting tomorrow raises near-term delivery credibility." },
      { targetCategory: "reliability",  direction: "increase", magnitude: 0.7, reason: "The meeting centers on enterprise reliability guarantees." },
      { targetCategory: "auditability", direction: "increase", magnitude: 0.7, reason: "Regulated fintech buyers require audit trails." },
      { targetCategory: "timeline",     direction: "increase", magnitude: 0.6, reason: "A credible plan is needed by tomorrow, not a long rewrite." },
    ],
    missingInformation: ["Exact SLA targets", "Current incident rate"],
  };
}
```

**Pre-baked graph + attacks — a SEPARATE context-hero fixture (do not retune the base one).** The base plan's `src/llm/fixture.ts` hardcodes keystone `a_arch` across four committed tests (Task 5 `keystone(...)==="a_arch"`, Task 8 `selectKeystoneId==="a_arch"`/`selectFailures.has("a_arch")`/`setConfidence("a_arch",…)`, Task 9 `pos.get("a_arch")`) and the Task 13 manual script. **Retuning it in place would break Founder A's own green tests.** So the context demo ships its **own** graph, `src/context/fixtures.ts::fixtureContextGraph()`, with distinct node ids, leaving `src/llm/fixture.ts` and all `a_arch` base tests untouched. It has **9 nodes** (so it lands in Band 2, §8) and its keystone is the near-term-credibility assumption.

```ts
// src/context/fixtures.ts — product-AND aggregation (base engine), OR groups on non-keystone
// legs so the keystone is STRICTLY load-bearing (real impact gap, not a sort-order tie).
export function fixtureContextGraph(): Graph {
  return {
    thesisId: "T",
    nodes: [
      { id: "T",         type: "thesis",     label: "Migrate to microservices",              confidence: 1.0,  groups: [{ kind: "AND", childIds: ["c_exec", "c_reliab", "c_roi"] }] },
      { id: "c_exec",    type: "claim",      label: "We can execute safely near-term",       confidence: 1.0,  groups: [{ kind: "AND", childIds: ["k_credible"] }] },
      { id: "c_reliab",  type: "claim",      label: "Meets enterprise reliability now",      confidence: 1.0,  groups: [{ kind: "AND", childIds: ["k_credible"] }, { kind: "OR", childIds: ["a_obs", "a_audit"] }] },
      { id: "c_roi",     type: "claim",      label: "Migration ROI justifies it now",        confidence: 1.0,  groups: [{ kind: "OR",  childIds: ["a_bound", "a_load"] }] },
      { id: "k_credible",type: "assumption", label: "Can explain safe staged migration by meeting", confidence: 0.90, groups: [] }, // KEYSTONE — feeds c_exec AND c_reliab
      { id: "a_obs",     type: "assumption", label: "Enough observability for distributed ops", confidence: 0.85, groups: [] },
      { id: "a_audit",   type: "assumption", label: "Enterprise values auditability over purity", confidence: 0.80, groups: [] },
      { id: "a_bound",   type: "assumption", label: "Services have clean boundaries",         confidence: 0.90, groups: [] },
      { id: "a_load",    type: "assumption", label: "Load is uneven across features",         confidence: 0.85, groups: [] },
    ],
  };
}
export function fixtureContextAttacks(): Attack[] {
  return [
    { id: "atk_k",     targetId: "k_credible", category: "execution risk", severity: 0.80, rationale: "With tomorrow's meeting, there is no time to prove a safe staged migration — the plan is not credible yet." },
    { id: "atk_obs",   targetId: "a_obs",      category: "reliability",    severity: 0.40, rationale: "Observability is limited; distributed failure modes would be blind spots." },
    { id: "atk_bound", targetId: "a_bound",    category: "second-order",   severity: 0.30, rationale: "Domain boundaries are still shifting; premature splits need re-merging." },
    { id: "atk_audit", targetId: "a_audit",    category: "auditability",   severity: 0.35, rationale: "Audit trails across services are unproven for regulated buyers." },
  ];
}
```

**Engine-computed numbers (product-AND, OR=max — verify by running the engine, not by eye):**
- **Baseline integrity ≈ 62%** — `c_exec=0.90`, `c_reliab=0.90·max(0.85,0.80)=0.765`, `c_roi=max(0.90,0.85)=0.90`; `T=0.90·0.765·0.90 ≈ 0.6197`.
- **Keystone knock-out → 0%** (impact ≈ 62), vs next-highest assumption impact ≈ 3.6 → `k_credible` is **strictly dominant**, so `keystone()` returns it unambiguously (not a tie broken by sort order — the flaw the base fixture has, where all four assumptions share impact 13.7).
- **Post-load integrity ≈ 3%** — after attacks, `k_credible→0.18`; `c_exec=0.18`, `c_reliab=0.18·0.52≈0.094`, `c_roi=max(0.63,0.85)=0.85`; `T≈0.0143`. Gauge craters **62% → ~3%**.
- **Failure set (threshold 0.35):** `k_credible`, `c_exec`, `c_reliab`, `T` fail; **`c_roi` HOLDS** and all leaf assumptions survive — a **partial collapse** exactly like the collapsed SVG ("Cost justified by ROI · HOLDING", verdict "decision unsupported").

> **Honesty note on the numbers.** The design-spec mockups show `87% → 34%`; those are illustrative SVG figures and **do not** hold under the base engine's **product-AND** aggregation (which drives multi-assumption baselines down — the *base* fixture actually computes ≈14%). This plan therefore quotes the **engine-computed** `≈62% → ≈3%` and **pins them in a unit test** (like base Task 5 pins `a_arch`) rather than repeating the mockup gate. If a higher, less-total "90% → 30%" gauge is wanted, the sanctioned Day-2 levers (design spec §12 open question) are: switch AND-aggregation from `product` to `min` (raises baselines sharply — but this edits the frozen engine + its tests, so treat as an explicit engine change, not a fixture tweak), reduce the keystone attack severity, or shorten the critical AND path.

**Fallback ladder (identical to base, extended):**
1. Validate every response against its zod schema.
2. On failure, **retry once**.
3. On repeated failure **or no key/network**, return the pre-baked fixtures: `/api/context` → `fixtureCompanyContext` / `fixtureDecisionContextPack` (with `source: "fixture"`); `/api/extract` → `fixtureContextGraph()`; `/api/attacks` → `fixtureContextAttacks()`. The UI shows `⚠ demo fallback` but is otherwise identical. (The base app, if run standalone without context, still falls back to `src/llm/fixture.ts`'s `a_arch` graph — the two fixtures coexist.)

Rehearse with the network **off** so the fixture path is the tested-default path.

---

## 14. Risk Register

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| **Claude API latency** (2 sequential Opus calls on Analyse) | High | Med | Show progressive UI (Context Used renders on call 1, graph on call 2); pre-fill hero inputs; rehearse offline (fixtures are instant); `max_tokens` sized, no `thinking` on extract/attacks. |
| **Claude malformed JSON** | Med | High | `zodOutputFormat` structured output + zod parse + **retry once** + fixture fallback; `postClamp` tolerates off-range scores instead of rejecting. |
| **Overcomplicated UI** | Med | Med | Four textareas + one read-only Context Used panel; no forms, no upload, no JSON editor (§15). |
| **Merge conflicts** | Med | Med | Disjoint file ownership (§10); `src/context/types.ts` frozen hour 2; both `KeystoneApp.tsx` and `useKeystone.ts` owned solely by B. |
| **Context compiler produces vague facts** | Med | Med | Grounding rules in prompt ("don't invent; ≤20 words; company-specific; use missingInfo"); hero fixture is hand-written and sharp; Context Used sorts weight rows by magnitude so the strongest, most-specific reasons lead. |
| **Graph too large / messy** | Low | Med | Extraction prompt caps labels ≤8 words; context-hero fixture is 9 nodes (Band-2, layered-2.5D); `pickLayoutMode` + Dagre keep layout deterministic; Band-3 clustering is stretch-only. |
| **Demo depends on network** | Med | High | Entire flow works offline via fixtures; rehearse with network off; `⚠ demo fallback` chip is honest but non-fatal. |
| **Time spent on OpenKB integration** | Low | High | **Explicit non-goal** (§15); OpenKB is a future upstream memory source only, mentioned never built. |
| **Engine/LLM boundary blurred** | Med | High | Hard invariant (§9): engine imports nothing from context/llm; `boundary.test.ts` guard; the only deterministic context code is one pure `reweightAttacksByContext` in `src/context/`, flag-toggleable, applied before the engine. |
| **Combined context call unreliable** | Low | Med | Function boundary allows splitting into `compileCompanyContext` → `buildDecisionContextPack` two-call mode without touching route/UI (§5.1). |
| **Base app not built in time** (real risk — greenfield) | Med | High | Base plan is fully spec'd (copy-paste code) and split so B has a runnable base demo by end of Day 1 **before** context; context degrades gracefully to fixtures. |

---

## 15. Explicit Non-Goals

Do **not** build for the hackathon:
- Full OpenKB integration or any RAG ingestion pipeline (OpenKB is a *future* upstream memory source — mention, don't build).
- Persistent document knowledge base; database persistence; saving/loading decisions.
- Document / PDF upload (unless a single trivial paste-in, which the four textareas already cover).
- User accounts, auth, permissions, multi-company workspaces, long-term memory, collaborative editing.
- Structured per-field context **forms** — free-text textareas + LLM compilation is the whole point.
- An editable CompanyContext JSON viewer or context history.
- Production observability, rate limiting, cost dashboards.
- Real Band-3 clustered-zoom rendering if time is short (it falls back to the layered view; the context-hero fixture is 9 nodes → Band-2, so Band-3 never appears in the demo).
- A true AND/OR **cascade propagation** engine beyond threshold `detectFailures` (the base plan already scopes cascade as visual; only add real cascade if Day-2 time remains).

The single goal: the strongest possible **live, offline-safe demo** of context-grounded decision collapse.

---

## 16. Final Deliverables Checklist

### Files to create — Founder A (core & contracts)
- [ ] `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.local.example` (base Task 1)
- [ ] `src/engine/{types,propagation,sensitivity,load,index}.ts` + `*.test.ts` (base Tasks 2–4)
- [ ] `src/engine/boundary.test.ts` (new guard)
- [ ] `src/llm/{schemas,fixture,client}.ts` (base Tasks 5–6) — `client.ts` with `pack?` params
- [ ] `src/llm/reinforce.ts` (stretch)
- [ ] `src/context/types.ts` (§4)
- [ ] `src/context/schemas.ts` (§4.1)
- [ ] `src/context/compile.ts` (§5.3, prompts §6.1/6.2)
- [ ] `src/context/weights.ts` (§9)
- [ ] `src/context/fixtures.ts` (§13)
- [ ] `src/context/index.ts` (barrel)
- [ ] `src/context/{compile,weights,fixtures}.test.ts`

### Files to create — Founder B (product & integration)
- [ ] `src/store/useKeystone.ts` + `useKeystone.test.ts` (base Task 8 + context state `companyContext`/`decisionContextPack`/`contextSource`, actions `setContext`/`analyse`) + `src/store/boundary.test.ts` (key-safety guard)
- [ ] `src/canvas/{layout,StructuralNode,KeystoneCanvas}.{ts,tsx}` + `layout.test.ts` (base Tasks 9,11) + Band-2 depth (§8)
- [ ] `src/ui/{IntegrityGauge,ConfidenceSlider,LoadPanel}.tsx` (base Tasks 10,12)
- [ ] `src/ui/ContextPanel.tsx` (new, §7.2)
- [ ] `src/ui/ContextUsedPanel.tsx` (new, §7.3)
- [ ] `src/app/{layout,page,KeystoneApp}.tsx` (base Tasks 1,13)
- [ ] `src/app/api/extract/route.ts`, `src/app/api/attacks/route.ts` (base Task 7, + `pack?`)
- [ ] `src/app/api/context/route.ts` (new)
- [ ] `src/app/api/reinforce/route.ts` (stretch)
- [ ] `src/app/api/{routes,context/route}.test.ts`

### Files to modify (seams)
- [ ] `src/llm/client.ts` — `extractStructure(text, pack?)`, `generateAttacks(graph, pack?)`
- [ ] `src/app/api/extract/route.ts`, `.../attacks/route.ts` — forward optional `pack`
- [ ] `src/store/useKeystone.ts` — `companyContext`, `decisionContextPack`, `contextSource`, `setContext`, `analyse`, reweight in `applyLoad`
- [ ] `src/app/KeystoneApp.tsx` — mount `ContextPanel` + `ContextUsedPanel`, orchestrate Analyse

### API routes
- [ ] `POST /api/context` → `{ companyContext, decisionContextPack }` (+ `source`)
- [ ] `POST /api/extract` → `Graph` (accepts `pack?`)
- [ ] `POST /api/attacks` → `{ attacks }` (accepts `pack?`)
- [ ] `POST /api/reinforce` → `{ suggestion }` (stretch)

### Components
- [ ] `ContextPanel`, `ContextUsedPanel` (new) · `IntegrityGauge`, `ConfidenceSlider`, `LoadPanel`, `StructuralNode`, `KeystoneCanvas`, `KeystoneApp` (base)

### Types
- [ ] `ContextInput`, `BusinessContext`, `TechnicalContext`, `TemporalContext`, `UpcomingEvent`, `Deadline`, `Constraint`, `Objective`, `KnownRisk`, `CompanyContext`, `WeightCategory`, `ContextWeightAdjustment`, `DecisionContextPack`, `ContextCompileResult`, **`ContextRouteResponse` (= result + `source`)** (all `src/context/types.ts`)
- [ ] zod: `CompanyContextSchema`, `DecisionContextPackSchema`, `ContextCompileSchema` (+ `ContextCompileResult`↔`ContextCompileOutput` assignability assertion)

### Tests
- [ ] engine determinism (base) · context schema/clamp · `ContextCompileResult`↔`Output` assignability · compile fallback · deterministic reweight (incl. unclassifiable/no-match → unchanged) · **pinned context-hero fixture (baseline ≈62%, keystone `k_credible` strictly dominant, post-attack <10%, `c_roi` holds)** · engine-purity boundary guard · **client/key-safety boundary guard** · route integration (context/extract/attacks with `pack`, response carries `source`) · store `analyse` fallback · manual demo checklist (§12)

### Fixtures
- [ ] `src/llm/fixture.ts` base hero graph+attacks — **UNCHANGED** (keystone stays `a_arch`; base tests stay green)
- [ ] `src/context/fixtures.ts` `HERO_CONTEXT_INPUT`, `fixtureCompanyContext`, `fixtureDecisionContextPack`, **`fixtureContextGraph()` (9 nodes, keystone `k_credible`), `fixtureContextAttacks()`** (§13)

### Demo script
- [ ] §13 hero, rehearsed **offline**: pre-filled inputs → Analyse → Context Used (temporal facts + weight increases) → graph assembles → Apply Load → integrity craters, keystone cracks red → (stretch) Reinforce.

### Branch split & integration order
- [ ] `integration/context-layer` seeded by A (scaffold + `context/types.ts` + `engine/index.ts`) within hour 2
- [ ] `founder-a/context-core`, `founder-b/context-ui`
- [ ] Integration order: scaffold+types → engine → llm-core+context-core → store+canvas+ui → base routes+app (base demo green) → `/api/context`+ContextPanel+ContextUsedPanel+pack threading (context demo green) → collapse polish → merge to `main` after §12 checklist passes.

### Guardrails (never violate)
- [ ] `ANTHROPIC_API_KEY` only in `src/app/api/**` + server modules (`compile.ts`, `client.ts`, `reinforce.ts`); never imported by any `"use client"` file. The store/UI reach the model **only via `fetch`** to `/api/*`, never by importing `compileContext`/`@/llm/client`/`@anthropic-ai/sdk`. **Enforced by `src/store/boundary.test.ts`.**
- [ ] `src/engine/**` imports nothing from `context/`, `llm/`, `ui/`, React, or Next; never receives a context pack. **Enforced by `src/engine/boundary.test.ts`.**
- [ ] LLM never sets integrity/keystone/failures/collapse — only `@/engine` selectors do. The only deterministic context code is the pure `reweightAttacksByContext` (§4.4), applied in the store **before** `applyAttacks`, flag-toggleable.
- [ ] Every LLM call: zod-validated, retry once, fixture fallback, never throws.
```