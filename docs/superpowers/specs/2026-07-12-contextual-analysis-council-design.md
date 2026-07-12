# Contextual Analysis Council (Phase 3) — Design Spec

Date: 2026-07-12
Status: Draft — pending user review before implementation plan
Branch: founder-b/graph-redesign (Phase 3 will branch fresh from main after this branch merges)

## 1. Problem

The analysis is **context-blind**. The only place the gathered context touches the scoring is
`reweightAttacksByContext` (`src/context/weights.ts`) — a keyword match that nudges each attack's
severity by `severity × (1 + sign·K·magnitude)`, `K=0.5` hardcoded, category matched by substring
(`CATEGORY_KEYWORDS`). Everything else — each assumption's confidence, which node is the keystone,
what threatens the decision — is a generic computation that returns **the same answer for any
company**. The engine doesn't *know* it's reasoning about a bootstrapped freemium tool with a
6-week fundraise vs. an enterprise compliance play.

The intelligence should reason **from** the specific decision's situation. Per the research
(SALC: context-aware, instance-specific criteria + weights; MAKA / Nature vendor-risk:
role-separated agents + a critic; Tool-MAD / R-Debater: multi-agent debate to surface hidden
assumptions; epistemic-competence: ground every claim in evidence or abstain; Task-Aware Council:
fuse with historical utility), the field converges on a **council of specialized agents that
reason over the gathered context/evidence, checked by a critic**.

## 2. Goals / Non-Goals

**Goals**
- A **council of context agents** reasons from the compiled context pack + gathered findings +
  the extracted graph to reshape the analysis:
  1. **Weighting agent** — context-specific importance per node ("given your runway, execution is
     the spine") + the **context-keystone** (may differ from the topological keystone), each with
     a one-line rationale citing evidence.
  2. **Contextual stress agent** — situation-specific failure modes (real competitors, timeline,
     tech constraints) with reasoned severities — the source of context-shaped attack severity,
     replacing the keyword nudge.
  3. **Skeptic debate** — proposer vs. skeptic over the evidence surfaces 1–2 context-specific
     **hidden assumptions** and names the true fracture point (extends the existing `tunnel.ts`).
  4. **Critic / verifier** — every council claim must cite a supporting finding; ungrounded ones
     are dropped or downgraded (epistemic competence).
- Feed the **existing** engine + probabilistic solver (both untouched): the council reshapes
  *attacks* (severities + new situation-specific ones) and produces a contextual *overlay*
  (context-keystone, fracture narrative, hidden assumptions, grounded rationale).
- **Fuse with Phase-2 calibration** — the contextual verdict is adjusted by the user's track record.
- Preserve fixture-fallback + boundary discipline (council is server-only).

**Non-Goals**
- No change to the deterministic engine math (`propagation/sensitivity/load/cascade`) or the
  probabilistic solver / calibration math. The intelligence is **contextual reasoning, not a
  fancier formula** — explicitly NOT cut-sets / noisy-AND-OR (deferred/abandoned per user).
- The council does not rewrite graph topology. Hidden assumptions are *surfaced* (annotations),
  not silently injected as nodes in v1.
- No new LLM transport — reuse `structuredCall` / `exploreWithTools` (`src/llm/structured.ts`).

## 3. Architecture

The council runs **after extract** (we have the graph) and **before the solve**, server-side.
It consumes `{ graph, companyContext, decisionContextPack, findings }` and returns a `CouncilResult`.

```
gather → compile(context pack) → extract(graph) ──► COUNCIL ──► solve
                                                     │
   Weighting agent ─┐                                │  reshapes:
   Contextual stress agent ─┼─► Critic/verifier ─────┘   • contextualAttacks → applyAttacks
   Skeptic debate ──┘        (grounds/gates)             • nodeWeights + contextKeystoneId (overlay)
                                                         • hiddenAssumptions + fractureNarrative (overlay)
                                                         • fused with calibration (Phase 2)
```

### 3.1 The council members (server-side, `src/agents/council/*`)

Each is a `structuredCall` (forced tool + zod schema), `hasApiKey()`-gated, fixture-fallback,
never-throw — following the exact discipline of `generateAttacks` / the tunnel agents.

- **`weighContext(graph, pack, company, findings)` → `NodeWeighting[]`**
  Each `{ nodeId, contextWeight: 0..1, rationale, evidenceRefs }`. SALC-style: the model derives,
  for THIS situation, how load-bearing each assumption/claim is, grounded in cited findings.
  Also returns `contextKeystoneId` (the most load-bearing given context).
- **`stressContext(graph, pack, company, findings)` → `Attack[]`**
  Situation-specific attacks with reasoned severities (respecting the existing `[0.15, 0.55]`
  severity envelope so raw severity alone can't collapse the structure). These become the
  context-shaped load — replacing the keyword reweight as the severity source when live.
- **`debateSkeptic(graph, pack, findings)` → `{ hiddenAssumptions: HiddenAssumption[], fracture }`**
  Extends `tunnel.ts` (advocate vs. prosecutor) to a grounded proposer-vs-skeptic exchange whose
  product is 1–2 previously-unstated assumptions the situation hides + the named fracture point.
- **`critique(candidate, findings)` → `CouncilResult`**
  The verifier: each weighting/attack/hidden-assumption must cite ≥1 finding that supports it;
  ungrounded items are dropped, thinly-grounded ones downgraded. Enforces "abstain over fabricate."

### 3.2 Data (`src/agents/council/types.ts`, engine-inert)

```
interface NodeWeighting { nodeId: string; contextWeight: number; rationale: string; evidenceRefs: string[] }
interface HiddenAssumption { label: string; why: string; evidenceRefs: string[] }
interface CouncilResult {
  nodeWeights: NodeWeighting[];
  contextKeystoneId: string | null;      // load-bearing GIVEN context (may ≠ topological keystone)
  contextualAttacks: Attack[];           // situation-specific, reasoned severities
  hiddenAssumptions: HiddenAssumption[];
  fractureNarrative: string;             // "your Series-A timeline makes X the real fracture point"
  grounded: boolean;                     // critic verdict: is the whole result evidence-grounded
  source: "live" | "fixture";
}
```

### 3.3 Orchestration + integration

- **Runner** `runCouncil(input)` (server): weighting ∥ stress ∥ debate (parallel structuredCalls)
  → `critique` → `CouncilResult`. Any member failing → its fixture fallback; whole-council failure
  → `fixtureCouncil` (offline demo, mirrors `fixtureOutcomes`/`fixtures`). Exposed via
  `POST /api/council` (RLS/auth like the other routes; never 500).
- **Pipeline**: `KeystoneApp` calls `/api/council` after extract; attaches `CouncilResult` to the
  run and into the store (`setCouncil`).
- **Solve**: at the store's single "context meets engine" point (`useKeystone.ts:~396`), when a live
  `CouncilResult` is present, `applyAttacks` consumes `council.contextualAttacks` instead of
  `reweightAttacksByContext(...)`. The keyword reweight stays as the **fixture/offline fallback**.
- **Calibration fusion**: the displayed contextual verdict runs the Phase-2 `applyCalibration` on
  top (contextual → calibrated).

### 3.4 UI (surface the contextual reasoning)

- **Context-keystone**: when `contextKeystoneId` ≠ the topological keystone, surface it in the
  STRESS/verdict rail ("Given your situation, the real spine is **<label>** — <rationale>").
- **Fracture narrative** + **hidden assumptions**: a compact "What the council found" block —
  the situation-specific fracture sentence + the 1–2 surfaced unstated assumptions with their why.
- **Grounded rationale on nodes**: a node's context weight + one-line rationale on selection.
- Ledger aesthetic; when no council (offline with no key), fall back to today's view + keyword reweight.

## 4. Grounding / determinism / boundary

- **Epistemic competence**: the critic requires evidence refs; thin evidence → downgrade/omit, never
  fabricate. `grounded=false` → UI shows the deterministic view, not an ungrounded contextual claim.
- **Fixtures**: `fixtureCouncil` for scenarios A/B/R so the demo shows the contextual layer offline.
- **Boundary**: council lives under `src/agents/council/**` (server-only); never client-imported
  (boundary tests). The client sees only the `CouncilResult` JSON via `/api/council`.
- **Never throw / never 500**; `hasApiKey()` gates every live call.

## 5. Testing

- Each agent: schema-valid output; no-key → fixture; never throws.
- Critic: drops an ungrounded item; keeps a grounded one (constructed findings).
- Runner: partial failure → per-member fixture; total failure → `fixtureCouncil`.
- Integration: with a live council, the solve uses `contextualAttacks` (not the keyword reweight);
  without, it falls back to `reweightAttacksByContext` (existing behavior byte-identical).
- Fixtures: `runCouncil` on A/B/R yields a context-keystone + grounded result; offline demo works.
- Boundary + full suite green; engine + probabilistic + calibrate math untouched (git-verified).

## 6. Task decomposition (for the plan)

1. Council types + `fixtureCouncil` (A/B/R).
2. Weighting agent (`weighContext`) + prompt + schema + fallback.
3. Contextual stress agent (`stressContext`).
4. Skeptic debate (extend `tunnel.ts` → `debateSkeptic`).
5. Critic/verifier (`critique`) — grounding gate.
6. Runner (`runCouncil`) + `POST /api/council` route.
7. Store + pipeline wiring (consume council; solve uses contextualAttacks; calibration fusion).
8. UI (context-keystone, fracture narrative, hidden assumptions, per-node rationale).

## 7. Risks

- **Latency**: four+ LLM calls. Mitigate: parallel members; the critic is one pass; fixture fast-path
  offline. Council runs once per analyse, not per interaction.
- **Over-claiming**: the critic is the guardrail; `grounded=false` degrades to deterministic.
- **Engine-freeze**: council output feeds *attacks* + overlay only; no engine/propagation edits.
- **Boundary**: strictly server-side; client only ever holds the `CouncilResult`.
