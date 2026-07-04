# Keystone v8 — Merge founder-a + founder-b, and deepen the agents

**Goal:** integrate both core branches losing NO feature from either, maximize the combined feature set, and significantly deepen the context agents. From two code-grounded investigations of `origin/founder-a/context-core` vs our branch.
**Status:** PLAN — awaiting sign-off before execution.

## Honest framing (both investigations agreed)

- **founder-a is CORE-ONLY** (engine + llm + context; no `src/agents/**`, no canvas/store/landing/UI). Our branch is a **product superset** built from the same merge-base across v3–v7.
- **founder-a has NO product/logic feature we lack.** Its propagation is plain product-AND (ours is the v7 depth-robust typed aggregation), its fixtures are 163 lines (ours 776, A/B/R hero), its compiler/prompts are shallower, and explain/reinforce/engine-boundary were already harvested (commit 795f817). The `CompanyContext`/`DecisionContextPack` schema is **byte-identical** on both (we already adopted theirs).
- **The one genuinely-superior thing in founder-a: `src/llm/structured.ts`** — structured output via a **forced tool call** (`zodToJsonSchema` → `tool_choice:{type:"tool"}` → validate `tool_use.input`). Ours uses free-text JSON scraping (`indexOf("{")…lastIndexOf("}")`) in every live call. Theirs is strictly more reliable — the API returns schema-shaped input, killing the prose-wrap / truncated-brace / markdown-fence silent-fallback failures.
- **On the agents specifically:** founder-a has none, so "how they do agents" has no answer — the agent-depth problem is *self-inflicted*, not us-being-behind. The two real gaps: (a) gathered findings **never reach the compiler** (`compileContext` sees only the 4 textareas); (b) free-text scraping silently drops rich live output. founder-a's `structured.ts` is the key that makes deep agent output land reliably.

**Net:** the merge is "ours-as-base, absorb founder-a's 3 unique files + the forced-tool-call mechanism," then spend the real effort on deepening our agents. Nothing from either branch is deleted; combined surface is maximized.

---

## WAVE A ✅ — Mechanical merge (no features lost) — structured.ts + context boundary + live-smoke added; zod-to-json-schema dep; engine/validate.ts skipped (superseded); disposition recorded. 508 pass +1 skip, build 0, e2e PASS.

### V8-A1 · Absorb founder-a's unique files (additive)
- [ ] `src/llm/structured.ts` — take founder-a's `structuredCall` (forced tool call) + `hasApiKey`; add `zod-to-json-schema@^3.25.2` dependency (founder-a pins it; we don't have it). This is the transport layer Wave B builds on.
- [ ] `src/context/boundary.test.ts` — port founder-a's context-layer key-safety guard (context + engine never import `@anthropic-ai/sdk` / read `ANTHROPIC_API_KEY`); EXTEND its allowlist so `src/llm/structured.ts` is the sole sanctioned SDK importer. We lack a context-layer SDK-leak guard.
- [ ] `src/llm/live-smoke.test.ts` — adopt, adapted to our client signatures (their live-path smoke coverage).
- [ ] SKIP `src/engine/validate.ts` + its test — superseded by our `src/llm/validate.ts` (ours *repairs*: clamps, drops orphans/unreachable, dedups, severity-caps; theirs only detects). Document in the disposition why (see V8-A3). OPTIONAL nicety: port their *diagnostic surface* (issue-string list / valid-subset) into our validate as an additive return, only if Wave B wants it for UI.
- `src/engine/smoke.test.ts` is byte-identical → no action.

### V8-A2 · Perform the merge, ours-as-base
- [ ] `git merge origin/founder-a/context-core` on a throwaway integration branch; resolve EVERY shared `.ts` conflict as **ours** (ideas already absorbed): `engine/{types,propagation,sensitivity,load,index}.ts`, `llm/{client,schemas,fixture,reinforce}.ts`, `context/{compile,weights,schemas,types,fixtures,index}.ts` + their tests, `app/{layout,page}.tsx`. Add the 3 files from V8-A1. Verify full gates green, then fast-forward/merge into our branch.
- [ ] Alternative if a real `git merge` is too noisy: keep cherry-pick/harvest style — just add the 3 unique files as a commit and record the disposition. Same end state, cleaner history. (Recommended.)

### V8-A3 · Merge-disposition receipt
- [ ] Extend `docs/founder-a/contracts.md` "Merge disposition" with the final table (every founder-a file → ours/theirs/added/skipped + reason), so the merge is auditable and a future teammate sees nothing was lost.

**Guarantee:** Wave A deletes nothing. Every founder-a capability is either already present (subsumed), added (the 3 files), or explicitly superseded-and-documented (`engine/validate.ts`).

---

## WAVE B ✅ — forced-tool-call transport on all single-shot calls (compile/extract/attacks/design/reinforce/temporal/tunnel); repair wall+provenance+scenario+fixture kept on top; mocks migrated to tool_use blocks; live :3002 probe source:"live"; technical/business deferred to C5. 508 pass +1 skip, build 0, e2e PASS.

### V8-B1 · Route all live LLM calls through `structuredCall`
Replace `messages.create` + `collectText` + `extractJson`/`extractFindings` + `safeParse` with `structuredCall({schema, toolName, system, user, ...})` in each live path, KEEPING our downstream stack on top: the `validateGraph`/`validateAttacks` repair wall, `source:"live"/"fixture"` provenance, A/B/R scenario short-circuit, timeouts, `retryOnce`, and fixture fallback. Same prompts, same zod schemas — just a reliable transport.
- [ ] `src/context/compile.ts` (compileContext)
- [ ] `src/llm/client.ts` (extractStructure, generateAttacks)
- [ ] `src/llm/design.ts` (design candidates)
- [ ] `src/llm/reinforce.ts` (suggestion)
- [ ] `src/agents/temporal.ts` (no server tools → direct forced tool call)
- [ ] `src/agents/tunnel.ts` (prosecutor/advocate)
- [ ] CAVEAT: server tools (`web_search`/`web_fetch`) and a forced `tool_choice` CANNOT coexist in one request. So `technical.ts` (toolRunner) and `business.ts` (web tools) keep their exploration phase, then add a **final forced-tool `emit_findings` call** to convert exploration → typed output reliably (two-phase). Handled in Wave C.
- [ ] Tests: the existing mocked-SDK tests switch from mocking `messages.create`-returns-text to returning a `tool_use` block; keep all live/fallback/scenario assertions. Fixture paths unchanged.

**Risk:** engine-inert (only emission/parsing changes). This makes our already-deeper prompts LAND live far more often (today they fall back on any parse miss).

---

## WAVE C — Deepen the agents + context (the founder's core ask)

### V8-C1 · Feed gathered findings INTO the compiler ← highest impact, cheapest, do first
Today `compileContext` receives only the 4 textareas; the agents' structured research bypasses the context model entirely (only reaches extraction as a flattened fact string). Thread the collected `GatherFinding[]` (source + all fields) into `compileContext` so `CompanyContext`/`DecisionContextPack` — constraints, objectives, known-risks, weight adjustments — are built from real multi-source research with provenance, not a prose summary.
- [ ] `src/context/compile.ts`: new `findings` param + a rendered findings block in the user message + a prompt line "ground every constraint/objective/known-risk in the supplied findings; cite sources; list genuinely-absent info in missingInfo".
- [ ] `src/app/KeystoneApp.tsx` (~L191): pass `gatherFactsRef.current` into the `/api/context` body; `src/app/api/context/route.ts`: forward it.
- Engine-inert, live-path only, no contract change. **Do first.**

### V8-C2 · Rich, typed per-finding schema (kills flat label/value) — needs V8-B1
Replace flat `GatherFinding {label,value,source,detail?,specifics?}` with a reliably-populated structure: `{label, value, source, category, sourceExcerpt (verbatim quote), quantities:[{metric,value,unit?}], entities:string[], dateISO?, confidence, implication}`. Forced tool call (V8-B1) is what makes an 8-field schema land reliably.
- [ ] `src/agents/types.ts`, `src/agents/schemas.ts` (zod), each agent's prompt skeleton, `src/agents/fixtures.ts` (rewrite the 3 fixtures to the new shape — pinned in tests), `src/ui/AgentGather.tsx` (render the new fields — excerpt as a quote, quantities/entities as chips).
- Engine-inert; fixtures + agent tests re-pin.

### V8-C3 · Verbatim provenance all the way to the graph — needs V8-C2
Extend `ExtractFinding {source,fact}` to carry `sourceExcerpt`; update `renderFindings` + the `KeystoneApp` mapping so node `evidence` cites the ACTUAL quote, not a paraphrase. The EXTRACT prompt already asks for verbatim evidence — this makes it real.
- [ ] `src/llm/client.ts`, `src/app/KeystoneApp.tsx`. Engine-inert, low effort.

### V8-C4 · Cross-source synthesis in compile — needs V8-C1
Strengthen `CONTEXT_SYSTEM` to DERIVE known-risks/constraints from cross-agent signals (temporal "auditability meeting tomorrow" ∧ business "SOC2 required" ∧ technical "no observability" → one high-severity risk citing 3 sources). Produces the "multi-layered context" wow.
- [ ] `src/context/compile.ts` prompt. Engine-inert, cheap once C1 lands.

### V8-C5 · Deepen per-agent gathering (multi-step / multi-source)
- [ ] **technical.ts**: keep the 12-iteration toolRunner exploration; add a final forced-tool `emit_findings`; prompt it to cross-reference (manifest ∧ lockfile ∧ CI ∧ Dockerfile ∧ src dirs), grep TODO/FIXME/secrets/migrations, and COUNT (services, tests, deps). Engine-inert.
- [ ] **temporal.ts**: parse into the structured `UpcomingEvent`/`Deadline` shapes the schema already defines (type enum, dateDescription, relevanceToDecision, importance/severity, lead-time order) → directly feeds temporal weight adjustments. Engine-inert.
- [ ] **business.ts**: convert the single web-tool call into a multi-turn toolRunner (search → read → search again → synthesize competitors as entities), then a forced-tool finalizer. **RISK: tail latency** — bounded by REQUEST_TIMEOUT_MS + fixture fallback, but it's the riskiest item; keep the basic tool variants (dynamic-filtering ones blow the budget). Do LAST; latency-test.

### V8-C6 · Structured, provenance-bearing pack facts — DEFER / coordinate
`DecisionContextPack.relevantBusinessFacts:string[]` → `{statement,source,quantified?,confidence?}[]`. **Risky:** `DecisionContextPack` is the documented shared contract with founder-a (`contracts.md`); changing it needs coordination or a purely-additive parallel field. UI (`ContextUsedPanel`) + fixtures consume it. Defer to after the merge is settled; do additively if at all.

---

## Sequence & gates

1. Wave A (merge + absorb 3 files) → full gate + e2e, commit.
2. V8-B1 (forced-tool transport) → gate, commit.
3. V8-C1 → V8-C2 → V8-C3 → V8-C4 → V8-C5 (technical/temporal, then business) → each gated + committed.
4. V8-C6 only if coordinated.
Every item: `npx vitest run` green · `tsc --noEmit` clean · `NEXT_DIST_DIR=.next-gate next build` 0 · `npm run e2e` PASS · fixtures/demo beats preserved. No client wall-clock/random; scenario fixtures win; never 500; model `claude-opus-4-8`.

## What this delivers
- **Merge:** nothing lost from either branch; founder-a's net-new value (forced-tool-call + context boundary guard + live-smoke) absorbed; future `git merge` resolves clean with an auditable disposition.
- **Agents:** the self-inflicted depth gaps closed — findings reach the compiler (C1), land reliably (B1), carry rich typed multi-field data with verbatim provenance (C2/C3), synthesize across sources (C4), and gather more deeply per source (C5). The agents' existing multi-step work finally surfaces as genuinely multi-layered context.

## Deviations / open questions
- Confirm we WANT the `zod-to-json-schema` dependency (only new dep; small, widely used).
- V8-C6 (pack-fact contract change) — do we coordinate with founder-a or skip?
- Whether to do a literal `git merge` (noisy) vs the cleaner add-unique-files-as-a-commit (recommended) for Wave A2.
