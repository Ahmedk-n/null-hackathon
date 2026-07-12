import { describe, it, expect } from "vitest";
import type { Attack } from "@/engine";
import { critique, type CouncilDraft } from "./critique";

function makeDraft(overrides: Partial<CouncilDraft> = {}): CouncilDraft {
  return {
    nodeWeights: [],
    contextKeystoneId: null,
    contextualAttacks: [],
    hiddenAssumptions: [],
    fractureNarrative: "",
    ...overrides,
  };
}

describe("critique (deterministic grounding gate)", () => {
  it("drops ungrounded nodeWeightings and keeps grounded ones", () => {
    const draft = makeDraft({
      nodeWeights: [
        { nodeId: "n1", contextWeight: 0.8, rationale: "grounded", evidenceRefs: ["risk_exec"] },
        { nodeId: "n2", contextWeight: 0.6, rationale: "ungrounded", evidenceRefs: [] },
        { nodeId: "n3", contextWeight: 0.5, rationale: "dangling ref", evidenceRefs: ["nope"] },
      ],
    });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.nodeWeights).toHaveLength(1);
    expect(result.nodeWeights[0].nodeId).toBe("n1");
    expect(result.grounded).toBe(true);
  });

  it("drops ungrounded hiddenAssumptions and keeps grounded ones", () => {
    const draft = makeDraft({
      hiddenAssumptions: [
        { label: "grounded assumption", why: "cited", evidenceRefs: ["risk_exec"] },
        { label: "ungrounded assumption", why: "not cited", evidenceRefs: [] },
      ],
    });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.hiddenAssumptions).toHaveLength(1);
    expect(result.hiddenAssumptions[0].label).toBe("grounded assumption");
    expect(result.grounded).toBe(true);
  });

  it("grounded is false when every nodeWeighting/hiddenAssumption is ungrounded", () => {
    const draft = makeDraft({
      nodeWeights: [{ nodeId: "n1", contextWeight: 0.8, rationale: "x", evidenceRefs: [] }],
      hiddenAssumptions: [{ label: "a", why: "y", evidenceRefs: ["nope"] }],
    });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.nodeWeights).toHaveLength(0);
    expect(result.hiddenAssumptions).toHaveLength(0);
    expect(result.grounded).toBe(false);
  });

  it("keeps severity for attacks whose rationale cites a known finding key", () => {
    const attack: Attack = {
      id: "a1",
      targetId: "n1",
      category: "cat",
      severity: 0.5,
      rationale: "This is backed by risk_exec directly",
    };
    const draft = makeDraft({ contextualAttacks: [attack] });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.contextualAttacks).toHaveLength(1);
    expect(result.contextualAttacks[0].severity).toBe(0.5);
  });

  it("downgrades severity x0.85 (clamped) for attacks whose rationale mentions no known key", () => {
    const attack: Attack = {
      id: "a2",
      targetId: "n1",
      category: "cat",
      severity: 0.5,
      rationale: "Generic unsupported speculation",
    };
    const draft = makeDraft({ contextualAttacks: [attack] });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.contextualAttacks).toHaveLength(1);
    expect(result.contextualAttacks[0].severity).toBeCloseTo(0.425, 10);
  });

  it("clamps downgraded severity to [0.15, 0.55]", () => {
    const lowAttack: Attack = {
      id: "low",
      targetId: "n1",
      category: "cat",
      severity: 0.1,
      rationale: "unsupported",
    };
    const highAttack: Attack = {
      id: "high",
      targetId: "n1",
      category: "cat",
      severity: 0.9,
      rationale: "unsupported",
    };
    const draft = makeDraft({ contextualAttacks: [lowAttack, highAttack] });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.contextualAttacks[0].severity).toBeCloseTo(0.15, 10);
    expect(result.contextualAttacks[1].severity).toBeCloseTo(0.55, 10);
  });

  it("nulls contextKeystoneId when it points at a dropped node", () => {
    const draft = makeDraft({
      nodeWeights: [{ nodeId: "n1", contextWeight: 0.8, rationale: "x", evidenceRefs: [] }],
      contextKeystoneId: "n1",
    });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.nodeWeights).toHaveLength(0);
    expect(result.contextKeystoneId).toBeNull();
    expect(result.grounded).toBe(false);
  });

  it("keeps contextKeystoneId when it points at a surviving node", () => {
    const draft = makeDraft({
      nodeWeights: [{ nodeId: "n1", contextWeight: 0.8, rationale: "x", evidenceRefs: ["risk_exec"] }],
      contextKeystoneId: "n1",
    });
    const findingKeys = new Set(["risk_exec"]);

    const result = critique(draft, findingKeys);

    expect(result.contextKeystoneId).toBe("n1");
    expect(result.grounded).toBe(true);
  });

  it("never throws on an empty draft, returning all-empty arrays and grounded:false", () => {
    const draft = makeDraft();
    const findingKeys = new Set<string>();

    const result = critique(draft, findingKeys);

    expect(result.nodeWeights).toEqual([]);
    expect(result.hiddenAssumptions).toEqual([]);
    expect(result.contextualAttacks).toEqual([]);
    expect(result.contextKeystoneId).toBeNull();
    expect(result.grounded).toBe(false);
    expect(result.fractureNarrative).toBe("");
  });

  it("preserves fractureNarrative verbatim", () => {
    const draft = makeDraft({ fractureNarrative: "the thesis cracks here" });
    const result = critique(draft, new Set());
    expect(result.fractureNarrative).toBe("the thesis cracks here");
  });
});
