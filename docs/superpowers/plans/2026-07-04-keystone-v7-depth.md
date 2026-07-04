# Keystone v7 — Substance: real depth, real stress value, real bug fixes

**Set:** 2026-07-04, after founder feedback: "graphing is shallow af, stress provides little value, agents collect little/shallow info, UI elements broken (crack-readout overflow), you're improving the wrong areas." This plan is ALL substance — no new visualization.
**Approved direction:** fix the aggregation math + go genuinely deep.
**Exit:** all items [x] · vitest 100% · tsc clean · NEXT_DIST_DIR=.next-gate build 0 · npm run e2e PASS.

## Diagnosis (evidence-grounded, from 3 parallel audits)

- **Graphs shallow by decree, not capability.** Every fixture is exactly 3 layers (thesis→claim→assumption, assumptions always leaves). The engine (`propagation.ts`) is a generic arbitrary-depth DAG evaluator. Shallowness is forced by: one sentence in `EXTRACT_SYSTEM` ("leaf assumptions have groups:[]"), `NODE_MAX=12` (`validate.ts`), and — the real trap — **product-AND aggregation with theses pinned to confidence 1.0 makes deeper honest trees integrate to ~0** (documented at `fixtures.ts:605`).
- **Stress is a surfacing failure.** The engine computes per-attack `rationale`, `explainKeystone` (dominance ratio + narrative), `summariseLoadResult` (before→after, failed nodes, keystone shift), `supportBreakdown` (why integrity = N) — and STRESS renders NONE of it. It shows one integrity number + severity bars.
- **Agents shallow + discarded.** Findings are flat `{label,value,source}` strings; ~18 gathered, only ~5 surface (one citation per node); `renderPack` silently drops compiled `constraints/objectives/knownRisks/missingInfo` before extraction.
- **UI: one CSS root cause.** `.ledger-row` fixed 34px height + `.label` no `min-width:0`/overflow + `.ledger-value` nowrap@16px → long labels wrap and paint over the next row. That IS the crack-readout overlap (label = full decision sentence) + SelectionPanel + canvas node labels.

---

## WAVE 1 — parallel, disjoint

### V7-1 · Depth-robust aggregation + deep graphs + re-pin ✅ (TYPE-AWARE AND: geomean of leaf-assumptions = depth-robust corroboration / product with any internal child = keystone still craters — pure geomean proven unable to collapse. Fixtures deep: A 13-node/5-layer, B 9/4, R 13/5, design deepened. Beats preserved: A baseline 61.97→raw 18.04→grounded 6.86 (c_roi holds); B holds 47.59; R 55.40→9.69 grounded (differentiation holds); design 1/1/1. NODE_MAX 12→22. 459/459, e2e PASS)
The interlocking core — new math + deeper structure + re-authored fixtures must land as ONE consistent pass so numbers are re-pinned once.
- [ ] **Aggregation math** (`src/engine/propagation.ts`): replace product-AND with a DEPTH-ROBUST rule. Recommended: `aggregate(AND) = geometric mean of child supports` (single child = passthrough; a zeroed child → 0 so knockout still craters), `aggregate(OR) = max` (unchanged), `support(n) = clamp01(confidence(n) × aggregate(groups))`. Requirement, not the exact formula: (a) deterministic + pure; (b) 4–5 layer trees with honest sub-1.0 confidences yield meaningful (non-~0) integrity; (c) knocking out the keystone still collapses the thesis (keystone dynamics preserved); (d) OR branches still protect. Verify the chosen rule on paper + tests before committing.
- [ ] **Unlock depth**: `EXTRACT_SYSTEM` (`client.ts`) — remove the leaf-assumption ban; permit assumptions/sub-claims to decompose one more level (sub-assumptions) and evidence to be first-class child nodes where natural; raise `NODE_MAX` (12→~22, keep ≤25 so layout stays in built bands). `validate.ts` caps + the generic wall (acyclic/one-thesis/reachable) already support this — just widen caps; DO NOT require leaf assumptions.
- [ ] **Re-author fixtures DEEPER** (`src/context/fixtures.ts` A/B/R + design candidates, `src/llm/fixture.ts` may stay as the base or also deepen — if you touch it, re-pin `fixture.test.ts`): genuinely 4–5 layers — thesis → claims → assumptions → sub-assumptions/evidence-nodes — more branching (3-4 claims, 2-4 assumptions each), real depth. KEEP the demo beats coherent under the new math: R holds raw / keystone cracks grounded (partial collapse, one claim holds); A collapses; B holds; design tournament = 1 survivor / 1 stressed / 1 collapsed. Recompute every pinned number against the new aggregation and re-pin.
- [ ] **Re-pin ALL number-asserting tests**: `engine/{propagation,sensitivity,load,explain,reinforce}.test.ts`, `context/fixtures.test.ts`, `llm/client.test.ts`, `ui/design-fixtures.test.ts`, `canvas/layout.test.ts`, skyline crack numbers, LivePipeline/stress tests that assert integrity. Everything green on the new math.
- Files: `src/engine/propagation.ts` (+test), `src/engine/{sensitivity,load,explain,reinforce}.test.ts`, `src/llm/client.ts` (EXTRACT prompt only — NOT the render/live plumbing that V7-4 owns; coordinate: V7-1 edits the DEPTH RULES in the prompt, V7-4 edits renderPack — if both touch client.ts, V7-1 goes first and V7-4 rebases), `src/llm/validate.ts` (caps), `src/context/fixtures.ts`, related test files.
- **This is the big one. Everything else waits on it.**

### V7-2 · UI overflow/layout bug fixes ✅ (root fix: .ledger-row min-height + .label ellipsis/min-width:0 + .ledger-value 13px flex:0 — kills crack-readout/SelectionPanel/every ledger overlap at source; crack title truncated 40 + tooltip; canvas label 2-line clamp; SVG foundation label bar-width budget; ContextTab segments ellipsis; 2 regression tests; 103 passed)
- [ ] **Root fix** `src/ui/theme.css` `.ledger-row`: `.label { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }`, `.ledger-value { flex:0 0 auto; font-size:13px }`, and `.ledger-row { min-height:var(--row-h) }` (not fixed height) so nothing clips.
- [ ] **BUG 1 crack readout** (`src/ui/skyline/SkylineView.tsx:160`): truncate the building-title label to ~40 chars + `title=` tooltip (titles are full decision sentences).
- [ ] **BUG 2 SelectionPanel** confidence rows (`SelectionPanel.tsx`): covered by the root fix; verify the `— UNVERIFIED/ASSUMED` suffix doesn't overflow the 300px rail (move to a sub-line if needed).
- [ ] **BUG 3 canvas node label** (`src/canvas/StructuralNode.tsx`): add `overflow:hidden` to the node box + 2-line clamp on the label.
- [ ] **BUG 4 skyline SVG foundation label** (`SkylineSvg.tsx`): derive char budget from bar width or center + tighter truncate so it can't overrun the SVG.
- [ ] **BUG 5 ContextTab mode buttons** (`ContextTab.tsx`): `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` + `title=`, or shorten labels.
- [ ] Add a couple of regression tests where cheap (e.g. long-title crack row renders without the label exceeding the row). e2e stays green.
- Files: `src/ui/theme.css`, `src/ui/skyline/{SkylineView,SkylineSvg}.tsx`, `src/canvas/StructuralNode.tsx`, `src/ui/SelectionPanel.tsx`, `src/ui/tabs/ContextTab.tsx`, tests.

## WAVE 2 — after V7-1 lands (stable deep graphs + math)

### V7-3 · Stress value — surface the hidden engine insight
- [ ] **Attack rationale** in `AttackRow` (`StressTab.tsx`): render `attack.rationale` + a target LABEL (not just id) under the severity — the specific "why it breaks". Biggest single win.
- [ ] **Load-result summary** panel via `summariseLoadResult`: `baseline → post-load (−drop)`, failed-node labels, `keystone before → after` shift. Gated on `loadApplied`.
- [ ] **Keystone explanation** via `explainKeystone`: the deterministic sentence + `impactRatio` ("30× more load-bearing than the next assumption") on/above the sensitivity bars.
- [ ] **Support breakdown** via `supportBreakdown`: "why integrity is that number" — per-node `ownConfidence × dependencyFactor = support`, failed flagged (collapsible / right rail; reuse the LivePipeline treatment).
- [ ] **Firm-up payoff** (small new pure fn in `engine`, e.g. `marginalReinforcement`): per assumption, integrity gain from restoring its base confidence on the attacked graph → a `+N integrity` number on each DE-RISKING `PROVE ·` row. Pure + tested.
- [ ] **Cascade order** (small pure helper): ordered "what breaks first and why" from support values, replacing the unordered failures Set in the readout (presentational only; don't change `detectFailures`/store).
- [ ] Tests derive/range-assert (don't hard-pin brittle integers where the value is incidental). Terminal styling; fix any overflow using the V7-2 primitives.
- Files: `src/ui/tabs/StressTab.tsx`, `src/engine/{reinforce or new marginal helper, cascade helper}.ts` (+tests), reuse `@/engine/explain`.

### V7-4 · Agent + context richness (parallel with V7-3 — client/agents, disjoint from StressTab)
- [ ] **Feed the full pack** into extract + attack prompts: `renderPack` (`client.ts`) currently drops `relevantConstraints/relevantObjectives/relevantKnownRisks/missingInformation` — render them so the model extracts against real constraints/risks. Live path; engine-inert.
- [ ] **Multi-citation evidence**: `node.evidence` single → `evidence[]` (supporting + contradicting), so the ~12 discarded findings surface. `EvidenceSchema`→array, `NodeEvidence`, extract prompt cites multiple, `validate.ts` clone passes it through, evidence-plate UI renders 1-2 (engine-inert — no integrity change). Re-pin fixture evidence shape + SelectionPanel/plate tests.
- [ ] **Structured findings**: extend `GatherFinding` with optional typed specifics (`detail`/`metrics`/`entities` or populate the unused `raw`); agents instructed to extract quantified specifics (numbers, dates, named entities) not vague prose. Update agent fixtures + `GatherFindingsSchema` + route tests.
- [ ] **Deepen gather loops** (latency-aware): raise `technical max_iterations` and `business max_uses` modestly so agents dig into multiple files/sources — keep within the 30-60s timeout envelope (comment the trade-off; fixture fallback still protects the demo).
- Files: `src/llm/client.ts` (renderPack + prompts — after V7-1's prompt edits land), `src/llm/schemas.ts`, `src/engine/types.ts` (evidence array — engine-inert), `src/llm/validate.ts`, `src/agents/{types,schemas,technical,business,temporal}.ts`, `src/context/fixtures.ts` (evidence shape) + `src/agents/fixtures.ts`, tests.

## WAVE 3

### V7-5 · Sweep
- [ ] Full gates + e2e; a fresh depth/value/UI re-audit (did the shallowness/overflow actually resolve?); GOAL.md note; memory update; push.

## Invariants (unchanged)
Scenario fixtures win; offline keyless demo works; engine pure; never 500; no client wall-clock/random; NEXT_DIST_DIR gate builds; model claude-opus-4-8. **New:** the aggregation change is the ONE sanctioned math change — it re-pins numbers but must preserve the demo beats (R/A/B/design verdicts, keystone identity, collapse/hold discrimination).

## Deviations
(append here)
