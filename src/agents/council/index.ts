// Contextual analysis council — parallel runner (Phase 3, Task 6).
//
// Fans the three council seats out CONCURRENTLY (weighContext / stressContext /
// debateSkeptic — each already hasApiKey()-gated and never-throws on its own), assembles
// their outputs into one draft, runs the deterministic grounding critic over it, and stamps
// `source`. The whole body is wrapped in one more try/catch so a failure anywhere upstream of
// the critic (e.g. a malformed `company`/`pack` breaking `collectFindingKeys`) still resolves
// to a full `CouncilResult` via `fixtureCouncil` — this function never throws.
import type { Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";
import { hasApiKey } from "@/llm/structured";
import { weighContext } from "./weigh";
import { stressContext } from "./stress";
import { debateSkeptic } from "./debate";
import { critique, type CouncilDraft } from "./critique";
import { fixtureCouncil, scenarioForGraph } from "./fixtures";
import type { CouncilResult } from "./types";

/**
 * A gathered finding as threaded into the council. Deliberately loose/optional (mirrors
 * `WeighingFinding`, src/agents/council/weigh.ts) plus a couple of extra identifier fields
 * (`id`/`label`) so `collectFindingKeys` below can be liberal about what counts as a
 * resolvable evidence key — the app's several finding shapes (GatherFinding, ContextFinding,
 * ...) all pass through fine since every field here is optional.
 */
export interface CouncilFinding {
  source?: string;
  id?: string;
  label?: string;
  fact?: string;
}

export interface RunCouncilInput {
  graph: Graph;
  pack: DecisionContextPack;
  company: CompanyContext;
  findings: readonly CouncilFinding[];
  apiKey?: string;
}

/**
 * Builds the set of identifiers the critic (`critique`) treats as "a real gathered finding
 * this claim could cite". Liberal by design (more keys = fewer false drops): every non-empty
 * string identifier off each gathered finding (`source`/`id`/`label`), PLUS every
 * `company`/`pack` constraint/objective/known-risk id and `contextWeightAdjustments`
 * `targetCategory` slug — because the hand-authored `fixtureCouncil` claims (councilA/B/R,
 * src/agents/council/fixtures.ts) cite PACK/COMPANY ids like "con_time"/"risk_exec"/"obj_win",
 * not gathered-finding sources. Without the pack/company ids here, an empty (or unrelated)
 * `findings` array would make the critic drop every fixture-fallback claim on the offline
 * path, which is wrong — the offline demo must stay grounded.
 */
function collectFindingKeys(
  findings: readonly CouncilFinding[],
  company: CompanyContext,
  pack: DecisionContextPack,
): Set<string> {
  const keys = new Set<string>();
  const add = (value: string | undefined | null): void => {
    if (value && value.length > 0) keys.add(value);
  };

  for (const f of findings) {
    add(f.source);
    add(f.id);
    add(f.label);
  }

  for (const c of company.constraints) add(c.id);
  for (const o of company.objectives) add(o.id);
  for (const r of company.knownRisks) add(r.id);

  for (const c of pack.relevantConstraints) add(c.id);
  for (const o of pack.relevantObjectives) add(o.id);
  for (const r of pack.relevantKnownRisks) add(r.id);
  for (const w of pack.contextWeightAdjustments) add(w.targetCategory);

  return keys;
}

/**
 * Runs the contextual analysis council end-to-end: the three seats concurrently, the
 * deterministic grounding critic over their combined draft, then stamps `source` ("live" iff
 * an API key is configured, else "fixture" — mirrors every other council/agent module's
 * convention; each seat independently falls back to its own fixture on any live failure, so
 * this flag reflects whether live calls were attempted, not whether every seat succeeded).
 *
 * Never throws: any failure building `findingKeys` or running the three seats/critic falls
 * back to the whole hand-authored `fixtureCouncil(scenarioForGraph(graph))` result.
 */
export async function runCouncil(input: RunCouncilInput): Promise<CouncilResult> {
  const { graph, pack, company, findings, apiKey } = input;
  try {
    const [w, atks, deb] = await Promise.all([
      weighContext(graph, pack, company, findings, apiKey),
      stressContext(graph, pack, company, findings, apiKey),
      debateSkeptic(graph, pack, findings, apiKey),
    ]);

    const findingKeys = collectFindingKeys(findings, company, pack);

    const draft: CouncilDraft = {
      nodeWeights: w.nodeWeights,
      contextKeystoneId: w.contextKeystoneId,
      contextualAttacks: atks,
      hiddenAssumptions: deb.hiddenAssumptions,
      fractureNarrative: deb.fractureNarrative,
    };

    const graded = critique(draft, findingKeys);

    return { ...graded, source: hasApiKey() ? "live" : "fixture" };
  } catch {
    return fixtureCouncil(scenarioForGraph(graph));
  }
}
