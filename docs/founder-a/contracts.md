# Founder A — Contracts exposed to Founder B

Everything below is implemented, typechecked, and unit-tested on branch
`founder-a/context-core`. Import via the `@/*` alias (→ `src/*`).

## `@/engine` (barrel: `src/engine/index.ts`) — PURE, client-safe

**Types**
```ts
type NodeType = "assumption" | "claim" | "thesis";
type GroupKind = "AND" | "OR";              // alias: DepGroupKind
interface DepGroup { kind: GroupKind; childIds: string[] }
interface GraphNode { id: string; type: NodeType; label: string; confidence: number; groups: DepGroup[] }
interface Graph { nodes: GraphNode[]; thesisId: string }
interface Attack { id: string; targetId: string; category: string; severity: number; rationale: string }
interface Keystone { id: string; label: string; impact: number }   // NOTE shape: { id, label, impact }
// validation
interface AttackValidationResult { ok: boolean; issues: string[]; validAttacks: Attack[] }
// explainability (pure data contracts for Founder B panels)
interface GroupContribution { kind: GroupKind; childIds: string[]; value: number }
interface NodeSupport { id; type; label; ownConfidence; groups: GroupContribution[]; dependencyFactor; support; failed }
interface SupportBreakdown { thesisId: string; threshold: number; integrity: number; nodes: NodeSupport[] }
interface RankedAssumption { id: string; label: string; impact: number }
interface KeystoneExplanation { baselineIntegrity; keystoneId; keystoneLabel; keystoneImpact; nextImpact; impactRatio; ranked: RankedAssumption[]; explanation: string }
interface LoadResultSummary { baselineIntegrity; postLoadIntegrity; integrityDrop; failedNodeIds: string[]; holdingNodeIds: string[]; keystoneBeforeLoad; keystoneAfterLoad; attacksApplied; threshold }
```

**Functions** (all pure, deterministic)
```ts
const FAILURE_THRESHOLD = 0.35;
clamp01(n: number): number
computeSupport(graph: Graph): Map<string, number>
integrity(graph: Graph): number                        // thesis support * 100
applyAttacks(graph: Graph, attacks: Attack[]): Graph    // new graph; input never mutated
detectFailures(graph: Graph, threshold?: number): Set<string>   // default threshold = 0.35
rankLoadBearing(graph: Graph): Keystone[]               // desc by impact, tie-break id asc
keystone(graph: Graph): Keystone | null
cloneGraph(graph: Graph): Graph
topoOrder(graph: Graph): string[]                       // throws on cycle
graphReferenceIssues(graph: Graph): string[]            // dangling childIds / missing thesis / dup ids / empty
isGraphWellFormed(graph: Graph): boolean
attacksReferenceIssues(attacks: Attack[], graph: Graph): string[]   // attacks whose targetId is not a real node
validateAttacks(graph: Graph, attacks: Attack[]): AttackValidationResult   // target exists+is assumption, unique id, finite severity, rationale
// explainability (pure, deterministic — "code decides, and shows its work")
supportBreakdown(graph: Graph, threshold?: number): SupportBreakdown       // per-node support decomposition
explainKeystone(graph: Graph): KeystoneExplanation                         // why the keystone is load-bearing (as data)
summariseLoadResult(graph: Graph, attacks: Attack[], threshold?: number): LoadResultSummary   // collapse-panel data contract
```
> **Contract note:** `keystone()`/`rankLoadBearing()` return `{ id, label, impact }` (base-plan shape), **not** `{ assumptionId, impact }`. Use `keystone(g)?.id` for the keystone node id.

## `@/llm` — schemas & fixtures are client-safe; client/reinforce are SERVER-ONLY

`src/llm/schemas.ts` (client-safe)
```ts
GraphSchema, AttacksSchema, ReinforcementSchema           // zod
type GraphOutput, AttacksOutput, ReinforcementOutput      // z.infer
```
`src/llm/fixture.ts` (client-safe) — base a_arch fallback
```ts
FIXTURE_DECISION: string
fixtureGraph(): Graph
fixtureAttacks(): Attack[]
```
`src/llm/client.ts` (**SERVER-ONLY** — imports the SDK transitively; call from API routes only)
```ts
extractStructure(decisionText: string, pack?: DecisionContextPack): Promise<Graph>
generateAttacks(graph: Graph, pack?: DecisionContextPack): Promise<Attack[]>
```
`src/llm/reinforce.ts` (**SERVER-ONLY**)
```ts
suggestReinforcement(graph: Graph, pack?: DecisionContextPack): Promise<string>
```
- All three **never throw** and fall back to fixtures on no-key/failure (retry once first).
- **Pack-aware fallback:** with a `pack`, `extractStructure`/`generateAttacks` fall back to the **context hero** fixture (`fixtureContextGraph` / `fixtureContextAttacks`), so the offline context demo shows `k_credible`, not `a_arch`. Founder B just calls `extractStructure(decision, pack)`.

## `@/context` (barrel: `src/context/index.ts`) — client-safe EXCEPT `compile.ts`

`src/context/types.ts` — all context contracts (client-safe):
`ContextInput, BusinessContext, TechnicalContext, TemporalContext, UpcomingEvent, UpcomingEventType,
Deadline, Constraint, ConstraintType, Objective, KnownRisk, RiskCategory, CompanyContext,
WeightCategory, ContextWeightAdjustment, DecisionContextPack, ContextCompileResult, ContextRouteResponse`

`src/context/schemas.ts` (client-safe):
```ts
CompanyContextSchema, DecisionContextPackSchema, ContextCompileSchema  // zod
type ContextCompileOutput                                             // = z.infer, structurally == ContextCompileResult
postClamp(result: ContextCompileResult): ContextCompileResult          // tolerate out-of-range scores
```
`src/context/weights.ts` (client-safe, PURE — safe to run in the store before the engine):
```ts
normaliseCategory(raw: string): WeightCategory | null
reweightAttacksByContext(attacks: Attack[], adjustments: ContextWeightAdjustment[]): Attack[]
```
`src/context/fixtures.ts` (client-safe):
```ts
HERO_CONTEXT_INPUT: ContextInput
fixtureCompanyContext(): CompanyContext
fixtureDecisionContextPack(decision?: string): DecisionContextPack
fixtureContextGraph(): Graph        // 9 nodes, keystone k_credible
fixtureContextAttacks(): Attack[]
```
`src/context/compile.ts` (**SERVER-ONLY** — NOT re-exported from the barrel):
```ts
compileContext(input: ContextInput): Promise<ContextCompileResult>   // no key -> fixture; retry once; never throws
```

## Founder B integration rules
- Import context **types** from `@/context`; import `compileContext` **only** in `src/app/api/context/route.ts` (server), never in client/store/UI.
- Client calls the **`/api/context`** route via `fetch` — never imports `compileContext`, `@/llm/client`, or `@anthropic-ai/sdk`.
- Route responses should carry `source: "live" | "fixture"` (build `ContextRouteResponse = ContextCompileResult & { source }`). `compileContext` returns the pure `ContextCompileResult`; the route stamps `source`.
- Pass the `DecisionContextPack` into `/api/extract` and `/api/attacks`; forward to `extractStructure(decision, pack)` / `generateAttacks(graph, pack)`.
- To apply context weighting client-side, call `reweightAttacksByContext(attacks, pack.contextWeightAdjustments)` **before** engine `applyAttacks` (it is pure and key-free).
- The engine decides everything structural: never let LLM output set integrity/keystone/failures. Use `integrity()`, `keystone()`, `detectFailures()`.

## Merge disposition (2026-07-04)

These docs and their sibling modules were authored on `origin/founder-a/context-core`. The
integration branch (`founder-b/context-ui`) evolved the shared APIs further (evidence/provenance
node fields, provenance-carrying `*WithSource` LLM calls, scenario-pinned fixtures A/B/R, the
minimum-reinforcement solver, validation wall, timeline stress). Disposition for a future branch
merge is **ours-as-base on every shared path** — founder-a's unique, non-overlapping modules have
been harvested and adapted to our APIs, so the merge should resolve as *ours, with their ideas
already absorbed*.

### Harvested (adapted to our engine/LLM APIs)
- **`src/engine/explain.ts` + `explain.test.ts`** — `supportBreakdown` (per-node own-confidence ×
  group contributions), `explainKeystone`, `summariseLoadResult`. Ported verbatim in design; the
  only adaptation is that `NodeSupport` now **passes through** our node `evidence` (V3-6 provenance)
  and `provenance: "modified"` (V5-3) fields untouched — the pure engine still never reads them.
  Tests pinned to **OUR** hero numbers: baseline **61.97**, keystone `k_credible`, knock-out impact
  ratio **≈17** (≥5). The "partial collapse" test uses **reweighted** attacks (our
  `fixtureContextAttacks` are RAW and only dip the thesis → integrity ≈17.11%; the context pack's
  execution reweighting is what craters it to **6.38%** with `c_roi` holding) — an added companion
  test pins the RAW-survives half of the discrimination story.
- **`src/engine/boundary.test.ts`** — engine-purity guard. Globs `src/engine/*.ts` (future-proof)
  and asserts no source file imports `@/context`, `@/llm`, `@/ui`, `@/canvas`, `@/store`,
  `@/agents`, `react`, `next`, `zustand`, or `@anthropic-ai/sdk`. Covers our current engine set
  (types/propagation/load/sensitivity/reinforce/explain/index); `depth.ts` lives under `@/canvas`,
  not the engine, so it is out of scope by design.
- **`src/llm/reinforce.ts`** — `suggestReinforcement(graph, pack?)`. Kept founder-a's prompt idea
  (one concrete cheap experiment to validate the keystone, tailored to imminent temporal events),
  rewritten on our **proven-live** pattern: `new Anthropic({ maxRetries: 0 })` →
  `messages.create(..., { timeout: 30s })` → `collectText` → first-line extract → `retryOnce`
  (from `@/agents/retry`) → deterministic fixture. Their `messages.parse` + `zodOutputFormat` +
  forced tool call (via `structured.ts`) is replaced (those SDK APIs do not exist in
  `@anthropic-ai/sdk@0.68.0`; see GOAL.md v3 guardrail amendment). Model id stays `claude-opus-4-8`.
  Offline / no-key returns scenario-tailored fixture strings keyed by keystone id
  (`k_credible` / `k_sre` / `team_has_backend_capacity` for A/B/R) with a generic fallback.
- **`src/app/api/reinforce/route.ts`** — tiny `POST { graph, pack? } → { suggestion, source }`
  route (source also on `x-keystone-source`, matching `/api/attacks`). Never 500s: bad body or any
  failure degrades to a fixture suggestion.
- **UI wiring (`src/ui/tabs/StressTab.tsx`)** — an optional **VALIDATE BY** line in the DE-RISKING
  PLAN panel, fetched **after mount** from `/api/reinforce`; nothing renders until the suggestion
  resolves, and the panel never blocks on it.
- **`docs/founder-a/**`** — all seven docs copied verbatim (this file plus adversarial-review,
  maximal-build-loop, maximal-verification, repo-scout, technical-claims, verification).

### NOT harvested (deliberate)
- **`src/llm/structured.ts`** — founder-a's forced-tool-call structured-output helper
  (`messages.parse` + `zodOutputFormat` + a required tool). These SDK APIs are unavailable in the
  pinned `@anthropic-ai/sdk@0.68.0`; our whole live surface instead uses `messages.create` +
  balanced-JSON extract + zod `safeParse` + retry-once → fixture (proven live). Noted as a
  **deliberate post-hackathon refactor candidate** (adopt forced tool calls once the SDK version is
  bumped), not harvested now.
- **`src/llm/live-smoke.test.ts`** — founder-a's live smoke coverage. We already have equivalent
  live coverage via `scripts/smoke-live.mjs` and the acid test, so their smoke test is redundant on
  our branch and was skipped.
