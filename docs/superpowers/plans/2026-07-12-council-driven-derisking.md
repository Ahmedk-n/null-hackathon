# Council-Driven De-Risking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Contextual Analysis Council's diagnosis (real spine + hidden assumptions) into one concrete, cheap falsifying test per finding, surfaced as a "DE-RISK THESE" action tail on the council panel.

**Architecture:** A fourth council seat (`remediate.ts`) runs as a *stage 2* after `weigh`+`debate` (a genuine data dependency), emitting a `Remediation` per finding. The deterministic critic grounds them; a separate `remediationSource` keeps the action tail's honesty independent of the diagnosis and the attack-gate. The store, `/api/council`, engine, and structural DE-RISKING PLAN are untouched — remediations ride on the `CouncilResult` the store already holds.

**Tech Stack:** TypeScript (strict), Next.js 15, React 19, zod, `@anthropic-ai/sdk` (via the forced-tool `structuredCall` transport), vitest.

## Global Constraints

- Engine + probabilistic + calibrate + reinforce + marginal math OFF-LIMITS. Remediations are a pure overlay: never touch attacks, integrity, or the structural DE-RISKING PLAN.
- No attack-gate regression: the store's `useCouncil` gate (`source==="live" && grounded && contextualAttacks.length>0`) stays byte-identical. `source` remains `allLive` over the **three core seats** (weigh/stress/debate) only — a remediation fixture must never demote `source`.
- Server-only: `src/agents/council/remediate.ts` lives with its siblings. Client code imports only the `Remediation` / `CouncilResult` TYPE — never a value import of `@/agents/*`, `@/llm/*`, `@/context/compile`, `@/lib/supabase/server|admin`. Boundary tests enforce this.
- Never throws / never 500 / `hasApiKey()`-gated / fixture-fallback everywhere. No-key path makes no network call.
- No `Date` / `Math.random` / `new Date(` in client-reachable files. Remediation fixtures are static literals.
- Attack severity envelope `[0.15, 0.55]` (unchanged; remediations carry no severity).
- `vitest` + `npx tsc --noEmit` green each task boundary. Quote zsh bracket paths. Don't stage `tsconfig.json` / `next-env.d.ts`.
- Isolated verify server (if needed): `NEXT_DIST_DIR=.next-agent npx next dev -p 3002`; revert `git checkout -- tsconfig.json next-env.d.ts` after.
- Report files namespaced `p4-task-N-report.md`. Ledger: `.superpowers/sdd/council-derisk-progress.md`.

---

### Task 1: Data — `Remediation` type, schema, and grounded fixtures

**Files:**
- Modify: `src/agents/council/types.ts` (add `Remediation`; extend `CouncilResult`)
- Modify: `src/llm/council-schemas.ts` (add `RemediateSchema`)
- Modify: `src/agents/council/fixtures.ts` (add `remediations` + `remediationSource` to councilA/B/R via a `fixtureRemediations` helper)
- Test: `src/agents/council/fixtures.test.ts` (extend)

**Interfaces:**
- Produces:
  - `interface Remediation { findingId: string; kind: "spine" | "hidden"; action: string; evidenceRefs: string[]; }`
  - `CouncilResult` gains `remediations: Remediation[]` and `remediationSource: "live" | "fixture"`.
  - `RemediateSchema` (zod) with `.remediations: Remediation[]`; `type RemediateOutput`.
  - `export function fixtureRemediations(scenario: "A" | "B" | "R"): Remediation[]`.

- [ ] **Step 1: Write the failing test** — append to `src/agents/council/fixtures.test.ts`:

```ts
import { fixtureCouncil, fixtureRemediations } from "./fixtures";

describe("fixtureRemediations (offline, grounded)", () => {
  for (const scenario of ["A", "B", "R"] as const) {
    it(`scenario ${scenario}: remediations are grounded and well-formed`, () => {
      const council = fixtureCouncil(scenario);
      expect(council.remediationSource).toBe("fixture");
      expect(council.remediations.length).toBeGreaterThan(0);

      // Every remediation is grounded (>=1 evidenceRef) and its findingId resolves to a
      // surviving finding: a "spine" -> the contextKeystoneId; a "hidden" -> a hidden label.
      const hiddenLabels = new Set(council.hiddenAssumptions.map((h) => h.label));
      for (const r of council.remediations) {
        expect(["spine", "hidden"]).toContain(r.kind);
        expect(r.action.length).toBeGreaterThan(0);
        expect(r.evidenceRefs.length).toBeGreaterThan(0);
        if (r.kind === "spine") expect(r.findingId).toBe(council.contextKeystoneId);
        else expect(hiddenLabels.has(r.findingId)).toBe(true);
      }
      // Exactly one spine remediation, targeting the context-keystone.
      expect(council.remediations.filter((r) => r.kind === "spine")).toHaveLength(1);
    });
  }

  it("scenario A's spine remediation targets the shifted spine a_audit", () => {
    const council = fixtureCouncil("A");
    const spine = council.remediations.find((r) => r.kind === "spine");
    expect(spine?.findingId).toBe("a_audit");
  });

  it("fixtureRemediations returns the same array fixtureCouncil embeds", () => {
    expect(fixtureRemediations("B")).toEqual(fixtureCouncil("B").remediations);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agents/council/fixtures.test.ts`
Expected: FAIL — `fixtureRemediations` is not exported / `remediationSource` undefined.

- [ ] **Step 3a: Extend the types** — in `src/agents/council/types.ts`, after `HiddenAssumption`:

```ts
/** One concrete, cheap falsifying test that de-risks a specific council finding. */
export interface Remediation {
  /** The finding this de-risks: the context-keystone nodeId (kind "spine") OR a hidden
   *  assumption's `label` (kind "hidden"). Joins back to the surviving finding in the critic. */
  findingId: string;
  kind: "spine" | "hidden";
  /** One concrete, cheap experiment/evidence that would falsify the finding before committing. */
  action: string;
  /** Grounds the remediation; checked against findingKeys by the critic. */
  evidenceRefs: string[];
}
```

Then extend `CouncilResult` (add the two fields after `grounded`):

```ts
export interface CouncilResult {
  nodeWeights: NodeWeighting[];
  contextKeystoneId: string | null;
  contextualAttacks: Attack[];
  hiddenAssumptions: HiddenAssumption[];
  fractureNarrative: string;
  grounded: boolean;
  /** One de-risking action per surviving finding (spine + hidden). Overlay only — never
   *  consumed by the engine or the attack path. Grounded/filtered by the critic. */
  remediations: Remediation[];
  source: "live" | "fixture";
  /** Truthful source of `remediations` ALONE — independent of `source` so a failed action
   *  call cannot demote the diagnosis or block the live contextual attacks from the engine. */
  remediationSource: "live" | "fixture";
}
```

- [ ] **Step 3b: Add the schema** — in `src/llm/council-schemas.ts`, after `SkepticSchema`:

```ts
// Remediation agent (Phase 4): one concrete cheap falsifying test per surviving finding.
const RemediationSchema = z.object({
  findingId: z.string(),
  kind: z.enum(["spine", "hidden"]),
  action: z.string(),
  evidenceRefs: z.array(z.string()),
});

export const RemediateSchema = z.object({
  remediations: z.array(RemediationSchema),
});

export type RemediateOutput = z.infer<typeof RemediateSchema>;
```

- [ ] **Step 3c: Add fixtures** — in `src/agents/council/fixtures.ts`, add the `Remediation` import and a `fixtureRemediations` helper, then wire each scenario. Update the import line:

```ts
import type { CouncilResult, Remediation } from "./types";
```

Add the helper (place it above `fixtureCouncil`). Evidence ids below are the SAME pack/company ids the scenarios already cite (cross-checked in `councilA/B/R`), so the critic keeps them grounded offline:

```ts
// Grounded, decision-tailored de-risking actions per scenario. findingId of a "spine"
// remediation is that scenario's contextKeystoneId; "hidden" findingIds echo the scenario's
// hiddenAssumptions labels verbatim (the join key the critic + UI use). evidenceRefs reuse
// the same con_*/risk_*/obj_* ids the other fixture findings cite. No Date/Math.random.
export function fixtureRemediations(scenario: "A" | "B" | "R"): Remediation[] {
  switch (scenario) {
    case "A":
      return [
        {
          findingId: "a_audit",
          kind: "spine",
          action:
            "Before tomorrow's meeting, prepare a concrete audit-trail artifact for one service end-to-end (immutable log + access record) you can show live — proving auditability, not just describing the architecture.",
          evidenceRefs: ["con_reg", "obj_win"],
        },
        {
          findingId: "The buyer conflates 'new architecture' with 'more reliable'",
          kind: "hidden",
          action:
            "Ask the buyer directly what reliability evidence they need to see, so you validate that architecture change (not proven uptime) is actually what they're buying before you commit to it.",
          evidenceRefs: ["con_reg", "risk_exec"],
        },
        {
          findingId: "A credible-sounding plan will be treated as equivalent to a proven one",
          kind: "hidden",
          action:
            "Rehearse the staged-migration rollback on a copy of one service end-to-end tonight, so tomorrow's claim is backed by a real trace instead of a story.",
          evidenceRefs: ["con_time"],
        },
      ];
    case "B":
      return [
        {
          findingId: "k_sre",
          kind: "spine",
          action:
            "This week, run one paid on-call trial shift with a contractor to prove the two-SRE rotation is viable before betting the pilot on two unfilled hires.",
          evidenceRefs: ["con_time", "risk_hire"],
        },
        {
          findingId: "Two SRE hires can be sourced and onboarded before the pilot window closes",
          kind: "hidden",
          action:
            "Post the two SRE roles today and time-box sourcing to two weeks; if the pipeline is thin by then, trigger the contractor fallback rather than slipping the pilot.",
          evidenceRefs: ["risk_hire", "con_time"],
        },
        {
          findingId: "Runbooks alone substitute for battle-tested incident response",
          kind: "hidden",
          action:
            "Run one game-day incident drill against the runbooks before the pilot to prove they hold under a real failure, not just on paper.",
          evidenceRefs: ["risk_obs"],
        },
      ];
    case "R":
      return [
        {
          findingId: "team_has_backend_capacity",
          kind: "spine",
          action:
            "Run a 2-day spike: stand up excalidraw-room on your own infra, load-test one collaborative board, and measure how much of the six-person team's week it actually costs before committing at the roadmap meeting.",
          evidenceRefs: ["con-team", "risk-capacity"],
        },
        {
          findingId: "Building an own backend needs no hires beyond the current 6 people",
          kind: "hidden",
          action:
            "Estimate the ongoing on-call + maintenance hours a self-hosted realtime backend adds, and check it against the team's current roadmap load before assuming the existing 6 can absorb it.",
          evidenceRefs: ["con-team", "risk-capacity"],
        },
        {
          findingId: "Collaboration quality is the actual conversion lever, not price or breadth",
          kind: "hidden",
          action:
            "Run a cheap pricing/paywall experiment in parallel to test whether conversion is really gated by collab quality versus price, before spending a quarter on backend work.",
          evidenceRefs: ["obj-convert", "risk-opp-cost"],
        },
      ];
  }
}
```

Then, in each of `councilA()`, `councilB()`, `councilR()`, add these two fields right before the closing `source: "fixture",` line (use the matching scenario letter):

```ts
    remediations: fixtureRemediations("A"), // "B" in councilB, "R" in councilR
    remediationSource: "fixture",
    source: "fixture",
```

- [ ] **Step 4: Run tests + tsc to verify pass**

Run: `npx vitest run src/agents/council/fixtures.test.ts && npx tsc --noEmit`
Expected: PASS. (`tsc` confirms every `CouncilResult` literal now has the two new fields — the only from-scratch literals are councilA/B/R, updated here; all test-side councils are built from `fixtureCouncil`, so they inherit the fields.)

- [ ] **Step 5: Commit**

```bash
git add src/agents/council/types.ts src/llm/council-schemas.ts src/agents/council/fixtures.ts src/agents/council/fixtures.test.ts
git commit -m "feat(council): Remediation type + schema + grounded offline fixtures"
```

---

### Task 2: The remediation seat — `remediate.ts`

**Files:**
- Create: `src/agents/council/remediate.ts`
- Test: `src/agents/council/remediate.test.ts`

**Interfaces:**
- Consumes: `fixtureRemediations`, `fixtureCouncil`, `scenarioForGraph` (Task 1 / existing); `Remediation`, `HiddenAssumption` (types); `RemediateSchema` (schema); `hasApiKey`, `structuredCall` (`@/llm/structured`); `retryOnce` (`@/agents/retry`); `WeighingFinding` (`./weigh`).
- Produces:
  - `interface RemediateResult { remediations: Remediation[]; source: "live" | "fixture"; }`
  - `async function remediateFindings(graph, pack, company, contextKeystoneId, hiddenAssumptions, findings, apiKey?): Promise<RemediateResult>` with signature:
    - `graph: Graph`, `pack: DecisionContextPack`, `company: CompanyContext`, `contextKeystoneId: string | null`, `hiddenAssumptions: readonly HiddenAssumption[]`, `findings: readonly WeighingFinding[]`, `apiKey?: string`.

- [ ] **Step 1: Write the failing test** — `src/agents/council/remediate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fixtureContextGraph, fixtureCompanyContext, fixtureDecisionContextPack } from "@/context";
import { fixtureCouncil } from "./fixtures";
import { remediateFindings } from "./remediate";

describe("remediateFindings (no API key)", () => {
  it("returns grounded fixture remediations without throwing or calling the network", async () => {
    const graph = fixtureContextGraph();
    const pack = fixtureDecisionContextPack();
    const company = fixtureCompanyContext();
    const council = fixtureCouncil("A");

    const result = await remediateFindings(
      graph,
      pack,
      company,
      council.contextKeystoneId,
      council.hiddenAssumptions,
      [],
    );

    expect(result.source).toBe("fixture");
    expect(result.remediations.length).toBeGreaterThan(0);
    for (const r of result.remediations) {
      expect(["spine", "hidden"]).toContain(r.kind);
      expect(typeof r.action).toBe("string");
      expect(r.action.length).toBeGreaterThan(0);
      expect(Array.isArray(r.evidenceRefs)).toBe(true);
    }
  });

  it("caps remediations and always resolves (fixture) for scenario B + R too", async () => {
    for (const scenario of ["B", "R"] as const) {
      const council = fixtureCouncil(scenario);
      const result = await remediateFindings(
        fixtureContextGraph(),
        fixtureDecisionContextPack(),
        fixtureCompanyContext(),
        council.contextKeystoneId,
        council.hiddenAssumptions,
        [],
      );
      expect(result.remediations.length).toBeGreaterThan(0);
      expect(result.remediations.length).toBeLessThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agents/council/remediate.test.ts`
Expected: FAIL — cannot find module `./remediate`.

- [ ] **Step 3: Implement the seat** — `src/agents/council/remediate.ts` (mirrors `debate.ts` exactly: `hasApiKey()` gate → `retryOnce(live)` → fixture fallback on no-key / any failure / empty):

```ts
// Contextual analysis council — remediation agent (Phase 4).
//
// Stage 2 of the council: runs AFTER weigh (context-keystone) and debate (hidden assumptions)
// because it de-risks THEIR findings. Mirrors debateSkeptic (src/agents/council/debate.ts):
// hasApiKey() gate -> retryOnce(live run) -> live result; any failure (no key, network, schema,
// post-validation, or an empty remediations array) -> fixtureRemediations fallback. Never throws.
// ONE bounded structuredCall. `apiKey` is accepted for parity but not wired into the transport
// (structuredCall reads ANTHROPIC_API_KEY from env) — gating uses hasApiKey() only.
import type { Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";
import { hasApiKey, structuredCall } from "@/llm/structured";
import { RemediateSchema } from "@/llm/council-schemas";
import { retryOnce } from "@/agents/retry";
import { fixtureRemediations, scenarioForGraph } from "./fixtures";
import type { HiddenAssumption, Remediation } from "./types";
import type { WeighingFinding } from "./weigh";

const MAX_REMEDIATIONS = 4;

export interface RemediateResult {
  remediations: Remediation[];
  /** "live" ONLY on the successful live path (post-validation); "fixture" on no-key or any
   *  failure — lets runCouncil tag the action tail truthfully without demoting the diagnosis. */
  source: "live" | "fixture";
}

const REMEDIATE_SYSTEM = `You turn a decision's diagnosed weak points into ACTION. You are given the
real load-bearing assumption ("spine") and the hidden assumptions the situation conceals. For EACH,
emit ONE concrete, cheap experiment or piece of evidence that would falsify it BEFORE the decision is
committed — tailored to the company's real situation (timeline, competitors, constraints, findings).
If an imminent deadline exists, tailor the action to what to prove BEFORE it. Each remediation MUST:
set "kind" to "spine" (for the spine) or "hidden"; set "findingId" to the spine's node id or the
hidden assumption's exact label; put ONE actionable sentence in "action"; cite specific findings in
"evidenceRefs". Ground strictly in the supplied context; do not invent facts.

Return ONLY the emit_remediation tool call.`;

function renderPack(pack: DecisionContextPack): string {
  const lines: string[] = [`DECISION: ${pack.decision}`];
  if (pack.relevantTemporalFacts.length > 0) {
    lines.push("IMMINENT TEMPORAL FACTS:");
    for (const f of pack.relevantTemporalFacts) lines.push(`- ${f}`);
  }
  if (pack.relevantConstraints.length > 0) {
    lines.push("PACK CONSTRAINTS:");
    for (const c of pack.relevantConstraints) lines.push(`- [${c.id}] ${c.statement}`);
  }
  if (pack.relevantObjectives.length > 0) {
    lines.push("PACK OBJECTIVES:");
    for (const o of pack.relevantObjectives) lines.push(`- [${o.id}] ${o.statement}`);
  }
  if (pack.relevantKnownRisks.length > 0) {
    lines.push("PACK KNOWN RISKS:");
    for (const r of pack.relevantKnownRisks) lines.push(`- [${r.id}] ${r.statement}`);
  }
  return lines.join("\n");
}

function renderFindings(findings: readonly WeighingFinding[]): string {
  if (findings.length === 0) return "(no findings gathered)";
  return findings.map((f) => `- [${f.source ?? "unknown"}] ${f.fact ?? "(no fact recorded)"}`).join("\n");
}

/** One live remediation attempt: throws on any network/parse/schema failure (retryOnce retries). */
async function remediateRun(
  graph: Graph,
  pack: DecisionContextPack,
  contextKeystoneId: string | null,
  hiddenAssumptions: readonly HiddenAssumption[],
  findings: readonly WeighingFinding[],
): Promise<{ remediations: Remediation[] }> {
  const spineLabel =
    contextKeystoneId !== null
      ? graph.nodes.find((n) => n.id === contextKeystoneId)?.label ?? contextKeystoneId
      : "(no distinct spine)";
  const hiddenBlock =
    hiddenAssumptions.length > 0
      ? hiddenAssumptions.map((h) => `- ${h.label} — ${h.why}`).join("\n")
      : "(none)";

  const user = [
    `REAL SPINE (context-keystone): id=${contextKeystoneId ?? "null"} — ${spineLabel}`,
    `HIDDEN ASSUMPTIONS (findingId = the label verbatim):\n${hiddenBlock}`,
    `DECISION CONTEXT PACK:\n${renderPack(pack)}`,
    `GATHERED FINDINGS (cite via evidenceRefs):\n${renderFindings(findings)}`,
  ].join("\n\n");

  return structuredCall({
    schema: RemediateSchema,
    toolName: "emit_remediation",
    toolDescription: "Emit ONE concrete, cheap de-risking action per finding (spine + hidden).",
    system: REMEDIATE_SYSTEM,
    user,
  });
}

/**
 * Remediation seat: turns the council's diagnosis (real spine + hidden assumptions) into one
 * concrete, cheap falsifying test per finding. hasApiKey() gate -> retryOnce(live) ->
 * fixtureRemediations(scenarioForGraph(graph)) fallback on no-key, any failure, or an empty
 * result. Never throws; the no-key path makes no network call. `source` is truthful: "live" only
 * on the successful live path (post-validation), "fixture" on every fallback.
 *
 * `company` is accepted for interface parity with the other seats (its ids drive grounding in the
 * critic); the prompt draws situational detail from `pack`. `apiKey` is not wired into the
 * transport (see file header). Gating uses hasApiKey() only.
 */
export async function remediateFindings(
  graph: Graph,
  pack: DecisionContextPack,
  company: CompanyContext,
  contextKeystoneId: string | null,
  hiddenAssumptions: readonly HiddenAssumption[],
  findings: readonly WeighingFinding[],
  apiKey?: string,
): Promise<RemediateResult> {
  void company;
  void apiKey;

  const fallback = (): RemediateResult => ({
    remediations: fixtureRemediations(scenarioForGraph(graph)),
    source: "fixture",
  });

  if (!hasApiKey()) return fallback();

  try {
    const result = await retryOnce(() =>
      remediateRun(graph, pack, contextKeystoneId, hiddenAssumptions, findings),
    );
    // Post-validation wall: an empty remediations array is a failed generation -> fixture.
    if (result.remediations.length === 0) return fallback();
    const remediations: Remediation[] = result.remediations
      .slice(0, MAX_REMEDIATIONS)
      .map((r) => ({
        findingId: r.findingId,
        kind: r.kind,
        action: r.action,
        evidenceRefs: r.evidenceRefs,
      }));
    return { remediations, source: "live" };
  } catch {
    return fallback();
  }
}
```

- [ ] **Step 4: Run tests + tsc to verify pass**

Run: `npx vitest run src/agents/council/remediate.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agents/council/remediate.ts src/agents/council/remediate.test.ts
git commit -m "feat(council): remediation seat — one cheap falsifier per finding"
```

---

### Task 3: Ground remediations in the critic

**Files:**
- Modify: `src/agents/council/critique.ts` (add `remediations` to `CouncilDraft`; filter; widen return type)
- Test: `src/agents/council/critique.test.ts` (add `remediations: []` default to `makeDraft`; new cases)

**Interfaces:**
- Consumes: `Remediation` (types), `CouncilDraft` (existing).
- Produces: `CouncilDraft` gains `remediations: Remediation[]`. `critique(...)` return type widens to `Omit<CouncilResult, "source" | "remediationSource">` and its object includes a filtered `remediations`. A remediation survives iff `isGrounded(evidenceRefs, findingKeys)` **AND** its target finding survived (`kind:"spine"` → surviving `contextKeystoneId === findingId`; `kind:"hidden"` → some surviving `hiddenAssumptions[].label === findingId`).

- [ ] **Step 1: Write the failing test** — first, update the existing `makeDraft` in `src/agents/council/critique.test.ts` to include the new required field:

```ts
function makeDraft(overrides: Partial<CouncilDraft> = {}): CouncilDraft {
  return {
    nodeWeights: [],
    contextKeystoneId: null,
    contextualAttacks: [],
    hiddenAssumptions: [],
    fractureNarrative: "",
    remediations: [],
    ...overrides,
  };
}
```

Then add a new `describe` block:

```ts
import type { Remediation } from "./types";

describe("critique (remediation grounding)", () => {
  const spine: Remediation = { findingId: "n1", kind: "spine", action: "prove n1", evidenceRefs: ["risk_exec"] };
  const hidden: Remediation = { findingId: "assume X", kind: "hidden", action: "test X", evidenceRefs: ["risk_exec"] };

  it("keeps a spine remediation whose keystone survives and is grounded", () => {
    const draft = makeDraft({
      nodeWeights: [{ nodeId: "n1", contextWeight: 0.8, rationale: "g", evidenceRefs: ["risk_exec"] }],
      contextKeystoneId: "n1",
      remediations: [spine],
    });
    const result = critique(draft, new Set(["risk_exec"]));
    expect(result.remediations).toHaveLength(1);
    expect(result.remediations[0].findingId).toBe("n1");
  });

  it("drops a spine remediation when its keystone was nulled (finding didn't survive)", () => {
    // contextKeystoneId n1, but n1's nodeWeight is ungrounded -> keystone nulled -> spine dropped.
    const draft = makeDraft({
      nodeWeights: [{ nodeId: "n1", contextWeight: 0.8, rationale: "g", evidenceRefs: [] }],
      contextKeystoneId: "n1",
      remediations: [spine],
    });
    const result = critique(draft, new Set(["risk_exec"]));
    expect(result.remediations).toHaveLength(0);
  });

  it("drops a hidden remediation whose target assumption was dropped", () => {
    const draft = makeDraft({
      hiddenAssumptions: [{ label: "assume X", why: "w", evidenceRefs: [] }], // ungrounded -> dropped
      remediations: [hidden],
    });
    const result = critique(draft, new Set(["risk_exec"]));
    expect(result.remediations).toHaveLength(0);
  });

  it("keeps a hidden remediation whose assumption survives and is grounded", () => {
    const draft = makeDraft({
      hiddenAssumptions: [{ label: "assume X", why: "w", evidenceRefs: ["risk_exec"] }],
      remediations: [hidden],
    });
    const result = critique(draft, new Set(["risk_exec"]));
    expect(result.remediations).toHaveLength(1);
    expect(result.remediations[0].findingId).toBe("assume X");
  });

  it("drops a remediation with no resolving evidenceRef even if its finding survives", () => {
    const draft = makeDraft({
      hiddenAssumptions: [{ label: "assume X", why: "w", evidenceRefs: ["risk_exec"] }],
      remediations: [{ ...hidden, evidenceRefs: ["nope"] }],
    });
    const result = critique(draft, new Set(["risk_exec"]));
    expect(result.remediations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agents/council/critique.test.ts`
Expected: FAIL — `remediations` not on the returned object (and `CouncilDraft` type error until Step 3).

- [ ] **Step 3: Implement the grounding** — in `src/agents/council/critique.ts`:

Add `Remediation` to the type import:

```ts
import type { NodeWeighting, HiddenAssumption, CouncilResult, Remediation } from "./types";
```

Add `remediations` to `CouncilDraft`:

```ts
export interface CouncilDraft {
  nodeWeights: NodeWeighting[];
  contextKeystoneId: string | null;
  contextualAttacks: Attack[];
  hiddenAssumptions: HiddenAssumption[];
  fractureNarrative: string;
  remediations: Remediation[];
}
```

Widen the return type and add the filter. Replace the signature line and insert the remediation filter after `contextKeystoneId`/`grounded` are computed (it depends on the SURVIVING `contextKeystoneId` and `hiddenAssumptions`):

```ts
export function critique(
  draft: CouncilDraft,
  findingKeys: Set<string>,
): Omit<CouncilResult, "source" | "remediationSource"> {
  const nodeWeights = draft.nodeWeights.filter((w) => isGrounded(w.evidenceRefs, findingKeys));
  const hiddenAssumptions = draft.hiddenAssumptions.filter((a) => isGrounded(a.evidenceRefs, findingKeys));

  const contextualAttacks: Attack[] = draft.contextualAttacks.map((attack) => {
    if (rationaleCitesKnownFinding(attack.rationale, findingKeys)) return attack;
    return { ...attack, severity: clampSeverity(attack.severity * DOWNGRADE_FACTOR) };
  });

  const survivingNodeIds = new Set(nodeWeights.map((w) => w.nodeId));
  const contextKeystoneId =
    draft.contextKeystoneId !== null && survivingNodeIds.has(draft.contextKeystoneId)
      ? draft.contextKeystoneId
      : null;

  // A remediation survives iff it is grounded AND its target finding survived: a "spine"
  // remediation only if the (possibly-nulled) context-keystone still equals its findingId; a
  // "hidden" remediation only if some surviving hidden assumption's label equals its findingId.
  const survivingHiddenLabels = new Set(hiddenAssumptions.map((a) => a.label));
  const remediations = draft.remediations.filter((r) => {
    if (!isGrounded(r.evidenceRefs, findingKeys)) return false;
    if (r.kind === "spine") return contextKeystoneId !== null && r.findingId === contextKeystoneId;
    return survivingHiddenLabels.has(r.findingId);
  });

  const hasSurvivingClaim = nodeWeights.length > 0 || hiddenAssumptions.length > 0;
  const keystoneStillValid = draft.contextKeystoneId === null || contextKeystoneId !== null;
  const grounded = hasSurvivingClaim && keystoneStillValid;

  return {
    nodeWeights,
    contextKeystoneId,
    contextualAttacks,
    hiddenAssumptions,
    fractureNarrative: draft.fractureNarrative,
    grounded,
    remediations,
  };
}
```

- [ ] **Step 4: Run tests + tsc to verify pass**

Run: `npx vitest run src/agents/council/critique.test.ts && npx tsc --noEmit`
Expected: PASS. (`tsc` will also flag `src/agents/council/index.ts` — the critic's return no longer satisfies `CouncilResult` minus only `source`. That is fixed in Task 4; if running the whole suite now, `index.ts` still compiles because it spreads `graded` and adds `source` — it just lacks `remediationSource`, which Task 4 adds. Run the scoped `tsc` above; a full-repo `tsc` red on `index.ts` missing `remediationSource` is expected until Task 4.)

- [ ] **Step 5: Commit**

```bash
git add src/agents/council/critique.ts src/agents/council/critique.test.ts
git commit -m "feat(council): critic grounds remediations to surviving findings"
```

---

### Task 4: Wire the stage-2 seat into `runCouncil`

**Files:**
- Modify: `src/agents/council/index.ts`
- Test: `src/agents/council/run.test.ts` (extend)

**Interfaces:**
- Consumes: `remediateFindings` (Task 2), `critique` widened return (Task 3), `fixtureCouncil` (now with remediations, Task 1).
- Produces: `runCouncil` returns a full `CouncilResult` including `remediations` and `remediationSource`. `source` stays `allLive` over the three core seats ONLY.

- [ ] **Step 1: Write the failing test** — append to `src/agents/council/run.test.ts`:

```ts
describe("runCouncil remediations (no API key)", () => {
  it("includes grounded fixture remediations + a fixture remediationSource", async () => {
    const result = await runCouncil({
      graph: fixtureContextGraph(),
      pack: fixtureDecisionContextPack(),
      company: fixtureCompanyContext(),
      findings: [],
    });

    expect(result.remediationSource).toBe("fixture");
    expect(result.remediations.length).toBeGreaterThan(0);

    // Every surviving remediation joins to a surviving finding (spine -> keystone; hidden -> label).
    const hiddenLabels = new Set(result.hiddenAssumptions.map((h) => h.label));
    for (const r of result.remediations) {
      if (r.kind === "spine") expect(r.findingId).toBe(result.contextKeystoneId);
      else expect(hiddenLabels.has(r.findingId)).toBe(true);
    }
  });

  it("still resolves (fixture) with remediations when company/pack are malformed", async () => {
    const result = await runCouncil({
      graph: fixtureContextGraph(),
      pack: {} as unknown as DecisionContextPack,
      company: {} as unknown as CompanyContext,
      findings: [],
    });
    expect(result.remediations.length).toBeGreaterThan(0);
    expect(["live", "fixture"]).toContain(result.remediationSource);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agents/council/run.test.ts`
Expected: FAIL — `remediationSource` undefined on the result.

- [ ] **Step 3: Implement the wiring** — in `src/agents/council/index.ts`:

Add the import:

```ts
import { remediateFindings } from "./remediate";
```

Replace the body of the `try` block (from the `Promise.all` through the `return`) with the stage-1 / stage-2 structure:

```ts
    const [w, atks, deb] = await Promise.all([
      weighContext(graph, pack, company, findings, apiKey),
      stressContext(graph, pack, company, findings, apiKey),
      debateSkeptic(graph, pack, findings, apiKey),
    ]);

    // Stage 2: remediation de-risks the diagnosis (real spine + hidden assumptions), so it runs
    // AFTER weigh + debate — a genuine data dependency, not a barrier for convenience.
    const rem = await remediateFindings(
      graph,
      pack,
      company,
      w.contextKeystoneId,
      deb.hiddenAssumptions,
      findings,
      apiKey,
    );

    const findingKeys = collectFindingKeys(findings, company, pack);

    const draft: CouncilDraft = {
      nodeWeights: w.nodeWeights,
      contextKeystoneId: w.contextKeystoneId,
      contextualAttacks: atks.attacks,
      hiddenAssumptions: deb.hiddenAssumptions,
      fractureNarrative: deb.fractureNarrative,
      remediations: rem.remediations,
    };

    const graded = critique(draft, findingKeys);

    // `source` (the attack-gate driver) stays over the THREE CORE seats only — a remediation
    // fixture must never demote it or block live contextual attacks from the engine. The action
    // tail's honesty rides on the separate `remediationSource`.
    const allLive = w.source === "live" && atks.source === "live" && deb.source === "live";

    return { ...graded, source: allLive ? "live" : "fixture", remediationSource: rem.source };
```

(The `catch` returning `fixtureCouncil(scenarioForGraph(graph))` is unchanged — the fixture now carries `remediations` + `remediationSource` from Task 1.)

Update the `runCouncil` doc comment's `source` paragraph to note the stage-2 seat and that `remediationSource` is separate (one added sentence): "A fourth seat (`remediateFindings`) runs after weigh+debate and de-risks their findings; its truthfulness is reported separately as `remediationSource` so a canned action tail never demotes `source` or the attack gate."

- [ ] **Step 4: Run tests + full tsc to verify pass**

Run: `npx vitest run src/agents/council && npx tsc --noEmit`
Expected: PASS (full-repo `tsc` now green — `index.ts` supplies `remediationSource`).

- [ ] **Step 5: Commit**

```bash
git add src/agents/council/index.ts src/agents/council/run.test.ts
git commit -m "feat(council): stage-2 remediation wiring + separate remediationSource honesty"
```

---

### Task 5: Surface "DE-RISK THESE" in `CouncilFindings`

**Files:**
- Modify: `src/ui/tabs/StressTab.tsx` (`CouncilFindings` component only)
- Test: `src/ui/stress-tab.test.tsx` (extend)

**Interfaces:**
- Consumes: `council.remediations`, `council.remediationSource` (type-only `CouncilResult`, already imported in this file). No new value imports (boundary-safe).
- Produces: no exported surface change — a new "DE-RISK THESE" section inside `CouncilFindings`.

- [ ] **Step 1: Write the failing test** — append to `src/ui/stress-tab.test.tsx` (mirror the existing council render tests around line 398; they build state via `fixtureCouncil` + `setCouncil` and render `StressTab`). Use the existing harness helpers in that file:

```ts
it("renders a DE-RISK THESE action per surviving remediation, spine suppressed only when no shift", async () => {
  // Scenario A has a spine-shift (a_audit != topological keystone) -> spine row SHOWN.
  const s = freshStoreWithLoadedGraph("A"); // existing helper pattern in this file
  s.setCouncil(fixtureCouncil("A"));
  renderStress();

  const actions = await screen.findAllByTestId("council-remediation");
  // A: 1 spine + 2 hidden = 3 rows.
  expect(actions).toHaveLength(3);
  expect(screen.getByTestId("council-remediation-spine")).toBeInTheDocument();
});

it("suppresses the spine remediation when context-keystone == topological keystone", async () => {
  // Scenario B: contextKeystoneId (k_sre) == topological keystone -> spine row SUPPRESSED,
  // only the 2 hidden remediations remain.
  const s = freshStoreWithLoadedGraph("B");
  s.setCouncil(fixtureCouncil("B"));
  renderStress();

  const actions = await screen.findAllByTestId("council-remediation");
  expect(actions).toHaveLength(2);
  expect(screen.queryByTestId("council-remediation-spine")).not.toBeInTheDocument();
});

it("tags the de-risk actions ILLUSTRATIVE when remediationSource is fixture", async () => {
  const s = freshStoreWithLoadedGraph("A");
  s.setCouncil(fixtureCouncil("A")); // remediationSource: "fixture"
  renderStress();
  expect(await screen.findByTestId("council-remediation-illustrative")).toBeInTheDocument();
});
```

> Implementer note: match the EXISTING setup/render helpers already used by the council tests in this file (around line 398 — e.g. how they load a graph, call `setCouncil`, and render). The helper names above (`freshStoreWithLoadedGraph`, `renderStress`) are illustrative; use whatever the file already defines. The behavioral assertions (testids + counts) are the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/stress-tab.test.tsx`
Expected: FAIL — no `council-remediation` testid rendered.

- [ ] **Step 3: Implement the tail** — in `src/ui/tabs/StressTab.tsx`, inside `CouncilFindings`, compute the visible remediations (reuse the existing `showSpine` flag) and render a section after the hidden-assumptions block (before the component's closing `</div>`):

```tsx
  // DE-RISK THESE — one concrete action per surviving finding. The "spine" action is suppressed
  // when the context-keystone matches the topological keystone (no shift): the structural
  // DE-RISKING PLAN's "VALIDATE BY" already covers that node, so showing it here would duplicate.
  const visibleRemediations = council.remediations.filter((r) => (r.kind === "spine" ? showSpine : true));
```

Then the JSX section (place after the `hidden.length > 0` block):

```tsx
      {visibleRemediations.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="label" style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
              De-Risk These
            </span>
            {council.remediationSource === "fixture" && (
              <span
                className="chip mono"
                data-testid="council-remediation-illustrative"
                style={{ flex: "0 0 auto", fontSize: 9, color: "var(--muted)", borderColor: "var(--hair-strong)" }}
              >
                ILLUSTRATIVE
              </span>
            )}
          </div>
          {visibleRemediations.map((r, i) => (
            <div
              key={i}
              data-testid="council-remediation"
              style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--hair)" }}
            >
              <span
                className="chip mono"
                data-testid={r.kind === "spine" ? "council-remediation-spine" : undefined}
                style={{ flex: "0 0 auto", fontSize: 9, color: "var(--muted)", borderColor: "var(--hair-strong)" }}
              >
                {r.kind === "spine" ? "SPINE" : "HIDDEN"}
              </span>
              <span style={prose}>{r.action}</span>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Run tests + tsc to verify pass**

Run: `npx vitest run src/ui/stress-tab.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Full-suite gate + commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/ui/tabs/StressTab.tsx src/ui/stress-tab.test.tsx
git commit -m "feat(ui): DE-RISK THESE action tail on the council panel"
```

---

## Self-Review

**Spec coverage:**
- New seat `remediate.ts` → Task 2. ✓
- `Remediation` + `remediations` + `remediationSource` on `CouncilResult` → Task 1. ✓
- `RemediateSchema` → Task 1. ✓
- Stage-2 ordering (after weigh+debate) → Task 4. ✓
- Critic grounding (both survival rules + evidenceRef) → Task 3. ✓
- Fixtures grounded, A shows spine-shift → Task 1. ✓
- `source` stays 3-seat; `remediationSource` separate (no attack-gate regression) → Task 4. ✓
- UI "DE-RISK THESE" tail + spine-overlap suppression + ILLUSTRATIVE tag → Task 5. ✓
- Boundary (server-only seat, type-only client import) → `remediate.ts` uses the same imports as `debate.ts`; the boundary test suite runs in the full-suite gate (Task 5 Step 5). ✓
- Engine/store/route/KeystoneApp untouched → no task modifies them. ✓

**Placeholder scan:** No TBD/TODO. The one soft spot — Task 5's test helper names — is explicitly flagged as "match the existing helpers in this file"; the behavioral contract (testids + counts) is concrete.

**Type consistency:** `Remediation { findingId; kind: "spine"|"hidden"; action; evidenceRefs }` used identically in types (T1), schema (T1), seat (T2), critic (T3), fixtures (T1), UI (T5). `remediateFindings` signature in T2 matches its call in T4. `critique` return `Omit<CouncilResult,"source"|"remediationSource">` (T3) matches the `{...graded, source, remediationSource}` spread in T4. `remediationSource` spelled consistently everywhere.
