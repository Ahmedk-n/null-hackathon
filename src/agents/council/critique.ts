// Contextual analysis council — critic / grounding gate (Phase 3, Task 5).
//
// PURE, deterministic epistemic gate: no LLM call, no network, no Date/Math.random. Drops
// council claims that aren't backed by a real gathered finding, downgrades unsupported
// contextual attacks, and reports whether the surviving result can be trusted at all.
import type { Attack } from "@/engine";
import type { NodeWeighting, HiddenAssumption, CouncilResult } from "./types";

export interface CouncilDraft {
  nodeWeights: NodeWeighting[];
  contextKeystoneId: string | null;
  contextualAttacks: Attack[];
  hiddenAssumptions: HiddenAssumption[];
  fractureNarrative: string;
}

const MIN_SEVERITY = 0.15;
const MAX_SEVERITY = 0.55;
const DOWNGRADE_FACTOR = 0.85;

/** Grounded iff evidenceRefs is non-empty AND at least one ref resolves in findingKeys. */
function isGrounded(evidenceRefs: string[], findingKeys: Set<string>): boolean {
  return evidenceRefs.length > 0 && evidenceRefs.some((ref) => findingKeys.has(ref));
}

/** Case-insensitive substring test: does rationale mention any known finding key/token? */
function rationaleCitesKnownFinding(rationale: string, findingKeys: Set<string>): boolean {
  const lowerRationale = rationale.toLowerCase();
  for (const key of findingKeys) {
    if (key.length > 0 && lowerRationale.includes(key.toLowerCase())) return true;
  }
  return false;
}

function clampSeverity(severity: number): number {
  return Math.min(MAX_SEVERITY, Math.max(MIN_SEVERITY, severity));
}

/**
 * Deterministic grounding gate: enforces epistemic competence over a council draft by
 * dropping claims (nodeWeights/hiddenAssumptions) with no resolving evidenceRef, downgrading
 * contextual attacks whose rationale cites no known finding, and nulling a context-keystone
 * that no longer resolves to a surviving node. Never throws.
 */
export function critique(draft: CouncilDraft, findingKeys: Set<string>): Omit<CouncilResult, "source"> {
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
  };
}
