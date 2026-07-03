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
