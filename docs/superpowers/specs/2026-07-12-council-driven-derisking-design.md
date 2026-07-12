# Council-Driven De-Risking — Analysis → Action (Phase 4)

**Date:** 2026-07-12
**Branch base:** `main` @ `1df2c66` (after Phase 3 merge)
**Status:** design approved, awaiting spec review → writing-plans

## Problem

The Contextual Analysis Council (Phase 3) reads *this* decision's situation and produces a
**diagnosis**: the context-keystone (the real load-bearing assumption, which can differ from the
graph's topological keystone), the hidden assumptions the situation conceals, and a fracture
narrative. It then **stops at diagnosis** — it tells you what is fragile, not what to *do* about it.

Meanwhile the structural **DE-RISKING PLAN** (`ReinforcementPanel`, powered by the frozen
`minimalReinforcement` solver + a single `/api/reinforce` "VALIDATE BY" suggestion) is keyed on the
**topological keystone** and is blind to the council's context-keystone and hidden assumptions. So
the tool reads the real spine and the latent risks, then the action layer ignores them.

**Goal:** turn each council finding into one concrete, cheap, situation-tailored falsifying test,
surfaced as a **"DE-RISK THESE"** action tail on the council diagnosis panel. Keep structural
reinforcement (engine) and contextual remediation (council) cleanly separate and honestly labeled.

## Non-goals / invariants (bind every task)

- **Engine frozen.** `src/engine/{propagation,sensitivity,load,cascade,probabilistic,calibrate,
  reinforce,marginal}.ts` math is OFF-LIMITS. Remediations are a pure overlay — they never touch
  attacks, integrity, or the structural DE-RISKING PLAN.
- **No attack-gate regression.** The store's `useCouncil` gate
  (`source==="live" && grounded && contextualAttacks.length>0`) that lets contextual attacks reach
  the engine stays byte-identical. Remediation must NOT be able to block live attacks.
- **Server-only.** `src/agents/council/remediate.ts` lives with its siblings. Client code imports
  only the `Remediation` / `CouncilResult` TYPE — never a value import of `@/agents/*`, `@/llm/*`,
  `@/context/compile`, `@/lib/supabase/server|admin`. Boundary tests enforce this.
- **Never throws / never 500 / `hasApiKey()`-gated / fixture-fallback everywhere.** Offline (no key)
  returns grounded, decision-tailored fixture remediations with no network call.
- **No `Date`/`Math.random`/`new Date(` in client-reachable files.** Remediation fixtures are static.
- `vitest` + `tsc` green each task boundary. Quote zsh bracket paths. Don't stage
  `tsconfig.json` / `next-env.d.ts`.

## Architecture

### New seat — `src/agents/council/remediate.ts` (mirrors `debate.ts`)

```ts
export type RemediateRunResult = { remediations: Remediation[] };
export interface RemediateResult extends RemediateRunResult { source: "live" | "fixture"; }

export async function remediateFindings(
  graph: Graph,
  pack: DecisionContextPack,
  company: CompanyProfile,          // same inputs the other seats receive
  contextKeystoneId: string | null, // from weigh
  hiddenAssumptions: HiddenAssumption[], // from debate
  findings: GatheredFinding[],
  apiKey?: string,
): Promise<RemediateResult>;
```

- Runs as **stage 2** of `runCouncil`, after `weigh` + `debate` resolve — a genuine data
  dependency (cannot remediate a finding before it exists). `stress` stays in stage 1; remediation
  does not depend on it.
- ONE bounded `structuredCall` (`toolName: "emit_remediation"`), `retryOnce` (max 2), cap
  `remediations ≤ 4`. Prompt: given the real spine (context-keystone label) and the hidden
  assumptions, emit ONE concrete, cheap experiment per finding that would falsify it *before* the
  nearest imminent temporal event, grounded in the gathered evidence (cite evidence ids).
- `hasApiKey()`-gate → no-key returns `fixtureRemediations(...)` network-free. Live path wrapped in
  a whole-body `try/catch` → fixture on any failure. Empty result (no remediations) → fixture,
  ordered BEFORE the build so a blank tail never leaks. `source: "live"` only on validated non-empty.

### Data — `src/agents/council/types.ts`

```ts
export interface Remediation {
  findingId: string;              // context-keystone nodeId (kind "spine") OR hidden-assumption label (kind "hidden")
  kind: "spine" | "hidden";
  action: string;                 // one concrete, cheap falsifying test — single sentence
  evidenceRefs: string[];         // grounds the remediation; checked by the critic
}
// added to CouncilResult:
//   remediations: Remediation[];
//   remediationSource: "live" | "fixture";
```

`remediationSource` is **separate from `source`** — the honesty-preserving choice:
- The diagnosis (fracture / context-keystone / hidden) comes from the three core seats and is LIVE
  when they are; the action tail can independently be fixture. Two truthful tags, not one blended.
- `source` (attack-gate driver) stays = `allLive` over the **three core seats** (weigh, stress,
  debate) exactly as today. A remediation fixture never demotes `source`, so it can never block the
  live contextual attacks from reaching the engine. No regression.

### Grounding — `src/agents/council/critique.ts` (pure, deterministic)

The critic already drops ungrounded `nodeWeights` / `hiddenAssumptions`, downgrades unsupported
attacks, and nulls an orphan keystone. Extend it to filter `remediations` — a remediation survives
iff **both**:

1. `evidenceRefs ∩ findingKeys ≠ ∅` (grounded in a real finding), **and**
2. its target finding survived the critic:
   - `kind:"spine"` → the (possibly-nulled) surviving `contextKeystoneId` is non-null AND equals
     `findingId`;
   - `kind:"hidden"` → some surviving `hiddenAssumptions[].label === findingId`.

The `findingId` join key is the context-keystone **nodeId** for `spine` and the hidden
assumption's **`label`** for `hidden` (labels are the natural, human-visible key; the seat is
instructed to echo them verbatim). Orphans (referencing a dropped finding) are dropped. Keeps the "no ungrounded prose, no action for a
finding the critic already killed" invariant. The critic still returns
`Omit<CouncilResult, "source" | "remediationSource">`; `runCouncil` stamps both source fields.

### Offline — `src/agents/council/fixtures.ts`

`fixtureCouncil("A"|"B"|"R")` gains grounded `remediations` (each `evidenceRefs` citing the same
pack/company ids the other fixture findings use, so they survive the critic offline) and
`remediationSource: "fixture"`. Scenario A demonstrates the spine-shift case (context-keystone
`a_audit` ≠ topological `k_credible`) so the `spine` remediation is shown; the hidden-assumption
remediations appear in all three. A shared `fixtureRemediations(scenario)` helper backs both
`fixtureCouncil` and `remediateFindings`' fallback.

### Runner — `src/agents/council/index.ts`

```ts
const [w, atks, deb] = await Promise.all([weighContext(...), stressContext(...), debateSkeptic(...)]);
const rem = await remediateFindings(graph, pack, company, w.contextKeystoneId, deb.hiddenAssumptions, findings, apiKey);
const findingKeys = collectFindingKeys(...);            // unchanged
const graded = critique({ ...draft, remediations: rem.remediations }, findingKeys); // now grounds remediations
const allLive = w.source === "live" && atks.source === "live" && deb.source === "live"; // UNCHANGED (3 seats)
return { ...graded, source: allLive ? "live" : "fixture", remediationSource: rem.source };
```

Whole-runner `try/catch` → `fixtureCouncil(scenarioForGraph(graph))` (now includes remediations).
`/api/council` route unchanged (returns the whole council object).

### UI — `src/ui/tabs/StressTab.tsx` `CouncilFindings`

Append a **"DE-RISK THESE"** section after the hidden-assumptions block, rendered from
`council.remediations` (already grounded/filtered by the critic), ordered spine-first then hidden:

- **Spine-overlap suppression:** a `kind:"spine"` remediation is shown ONLY when the council's
  context-keystone differs from the topological keystone (`contextKeystoneId !== topoKeystoneId`) —
  the same spine-shift condition that already gates the red "real spine" line. When they match, the
  structural DE-RISKING PLAN's "VALIDATE BY" already covers that node, so the spine row is
  suppressed and only the hidden-assumption actions show.
- Each row: a `kind` badge (`SPINE` / `HIDDEN`) + the action sentence.
- `ILLUSTRATIVE` tag on the section when `remediationSource === "fixture"` (independent of the
  diagnosis's own fixture tag).
- The whole tail renders only when `≥1` remediation survives after suppression.

The store, `/api/council`, `KeystoneApp`, and the structural `ReinforcementPanel` are **untouched** —
remediations ride on the `CouncilResult` the store already holds and are never consumed by the
attack path.

## Data flow

```
weigh ─┐ (context-keystone)
stress ┼─ Promise.all (stage 1)
debate ┘ (hidden assumptions)
        └──► remediate (stage 2: real spine + hidden → one cheap test each)
              └──► critique (drop remediations that are ungrounded OR target a dropped finding)
                    └──► CouncilResult { ...diagnosis, remediations, source(3 seats), remediationSource }
                          └──► store holds it ──► StressTab CouncilFindings "DE-RISK THESE" tail
                                                   (spine row suppressed when no spine-shift)
```

## Testing

| Area | Cases |
|---|---|
| `remediate.ts` | live-mock returns validated remediations (`source:"live"`); no-key → fixture, no network; empty model result → fixture (blank never leaks); whole-body catch → fixture |
| `critique.ts` | drop remediation with no evidenceRef in findingKeys; drop `spine` remediation when keystone nulled; drop `hidden` remediation whose finding was dropped; keep grounded+surviving |
| `fixtures.ts` | A/B/R remediations grounded (evidenceRefs resolve to finding keys), `remediationSource:"fixture"`, A shows a `spine` remediation |
| `index.ts` (`runCouncil`) | stage-2 remediate wired; `source` still = 3-seat allLive (remediation fixture does NOT demote it); `remediationSource` reflects the remediate seat |
| `StressTab` | DE-RISK THESE renders from grounded remediations; spine row suppressed when `ctxKeystone===topoKeystone`, shown when differ; `ILLUSTRATIVE` tag on fixture remediationSource; tail hidden when no remediations survive |
| boundary | `remediate.ts` server-only; client imports `Remediation` type-only |

## Task decomposition (sequential — shared files)

1. **T1** — `types.ts` (`Remediation`, `remediations`, `remediationSource`) + `RemediationSchema`
   in `council-schemas.ts` + `fixtures.ts` remediations for A/B/R (+ `fixtureRemediations` helper).
2. **T2** — `remediate.ts` seat (`remediateFindings`) mirroring `debate.ts`, with fixture fallback.
3. **T3** — `critique.ts` remediation grounding (both survival rules) + carry through unwrapped.
4. **T4** — `index.ts` `runCouncil` stage-2 wiring + `source`/`remediationSource` honesty.
5. **T5** — `StressTab.CouncilFindings` "DE-RISK THESE" tail + spine-overlap suppression + tag.

Each task: TDD, `vitest` + `tsc` green, review before the next. Whole-feature review at the end.
Report files namespaced `p4-task-N-report.md`. Ledger: `.superpowers/sdd/council-derisk-progress.md`.
