import { describe, it, expect } from "vitest";
import { analysisDepth, presentStrata, STRATUM_LEVEL } from "./depth";
import { fixtureContextGraph, fixtureContextGraphB } from "@/context";
import type { Graph } from "@/engine";

describe("analysisDepth (V4-1 DEPTH metric)", () => {
  it("hero A reasons 4 strata deep with 6/9 assumptions grounded (V7-1 deepened)", () => {
    const d = analysisDepth(fixtureContextGraph());
    // thesis + claims + assumptions + evidence stratum; 9 assumptions (incl. 4 sub-leaves),
    // 6 grounded (k_credible, s_tracing, s_metrics, a_audit, s_domain, s_split); a_load ungrounded.
    expect(d.strata).toBe(4);
    expect(d.assumptions).toBe(9);
    expect(d.grounded).toBe(6);
  });

  it("scenario B carries the evidence stratum via its keystone (1/6 grounded)", () => {
    const d = analysisDepth(fixtureContextGraphB());
    expect(d.strata).toBe(4);
    expect(d.assumptions).toBe(6);
    expect(d.grounded).toBe(1); // only k_sre is grounded
  });

  it("a graph with NO evidence reports only 3 strata", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "T", confidence: 1, groups: [{ kind: "AND", childIds: ["c"] }] },
        { id: "c", type: "claim", label: "c", confidence: 1, groups: [{ kind: "AND", childIds: ["a"] }] },
        { id: "a", type: "assumption", label: "a", confidence: 0.5, groups: [] },
      ],
    };
    const d = analysisDepth(g);
    expect(d.strata).toBe(3);
    expect(d.assumptions).toBe(1);
    expect(d.grounded).toBe(0);
  });
});

describe("presentStrata", () => {
  it("includes the evidence stratum for hero A (4 strata, ordered top→bottom)", () => {
    const strata = presentStrata(fixtureContextGraph());
    expect(strata.map((s) => s.key)).toEqual(["thesis", "claim", "assumption", "evidence"]);
    expect(strata.map((s) => s.level)).toEqual([0, 1, 2, 3]);
  });

  it("omits the evidence stratum when no node carries evidence", () => {
    const g: Graph = {
      thesisId: "T",
      nodes: [
        { id: "T", type: "thesis", label: "T", confidence: 1, groups: [] },
        { id: "a", type: "assumption", label: "a", confidence: 0.5, groups: [] },
      ],
    };
    expect(presentStrata(g).some((s) => s.key === "evidence")).toBe(false);
  });
});

describe("STRATUM_LEVEL", () => {
  it("orders reasoning depth thesis (L0) → assumption (L2)", () => {
    expect(STRATUM_LEVEL.thesis).toBe(0);
    expect(STRATUM_LEVEL.claim).toBe(1);
    expect(STRATUM_LEVEL.assumption).toBe(2);
  });
});
