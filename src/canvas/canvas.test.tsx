// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { KeystoneCanvas, collapseDelayFor, buildDelayFor } from "./KeystoneCanvas";
import { pickLayoutMode } from "./layout";
import { fixtureContextGraph } from "@/context";
import type { Attack, Graph } from "@/engine";
import type { ContextWeightAdjustment } from "@/context";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React Flow measures nodes/viewport via ResizeObserver + matchMedia, neither of
// which jsdom implements. Minimal shims so the canvas mounts without throwing.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(cleanup);

const graph = fixtureContextGraph();

// V4-1 RETARGET — the old T10 asserted TILT as decoration (a rotate transform toggled
// by a checkbox). The founder's correction makes Z ENCODE reasoning depth, so TILT is
// superseded by the DEPTH VIEW contract: PLAN (top-down flat, NO perspective) ⟷ SECTION
// (perspective strata). We deliberately re-point these assertions to the new control:
// perspective present in SECTION and absent in PLAN, the L0..L3 stratum chrome rendered,
// and evidence plates drawn for grounded assumptions. See plan Deviations.
describe("KeystoneCanvas (V4-1 depth view — supersedes T10 tilt)", () => {
  it("selects the 2.5D band for the 13-node fixture graph", () => {
    expect(graph.nodes.length).toBe(13);
    expect(pickLayoutMode(graph.nodes.length)).toBe("layered-2-5d");
  });

  it("SECTION view carries the perspective + isometric strata transform", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} tilt />,
    );
    const wrap = container.querySelector<HTMLElement>("[data-canvas-perspective]");
    expect(wrap!.style.perspective).toBe("1400px");
    const tiltedLayer = container.querySelector<HTMLElement>("[data-canvas-tilt]");
    expect(tiltedLayer!.style.transform).toContain("rotate");
  });

  it("PLAN view removes the perspective and flattens the board (top-down)", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} tilt={false} />,
    );
    const wrap = container.querySelector<HTMLElement>("[data-canvas-perspective]");
    expect(wrap!.style.perspective).toBe("none");
    const flatLayer = container.querySelector<HTMLElement>("[data-canvas-tilt]");
    expect(flatLayer!.style.transform).toBe("none");
  });

  // Redesign · the L0..L3 stratum rule-lines/labels (StratumChrome) are no longer rendered
  // at all — the component still exists in KeystoneCanvas.tsx but nothing mounts it. The
  // "renders the L0..L3 stratum chrome labels" test is obsolete and removed.

  it("renders an evidence plate for each grounded assumption and an ungrounded drop for the ungrounded one when detail is on", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} />,
    );
    // Hero A (V7-1 deepened): k_credible + the four evidence-support sub-leaves
    // (s_tracing, s_metrics, s_domain, s_split) + a_audit are grounded (6); a_load is ungrounded.
    // Both plates and the ungrounded drop are gated on `detail` (defaults true here), so the
    // full evidence layer shows by default.
    const plates = container.querySelectorAll("[data-testid='evidence-plate']");
    expect(plates.length).toBe(6);
    expect(container.querySelectorAll("[data-testid='ungrounded-drop']").length).toBe(1);
  });
});

// V9-1 — MINIMALIST / PROGRESSIVE DISCLOSURE. The board is minimal when `detail={false}`:
// the L0..L3 stratum chrome, the constraint rail, the force arrows and every per-node
// evidence plate / ungrounded drop are HIDDEN, and each node renders just a status dot +
// label + keystone/failed marker. DETAIL (`detail` defaults true, or the GRAPH toggle sets
// it) brings the full chrome back. A `selectedId` node expands inline (data-expanded) even
// while the rest of the board stays minimal, so clicking reveals detail without un-quieting
// the whole board. This is the founder's "minimalist + expandable" contract.
describe("KeystoneCanvas (V9-1 minimalist board — detail off by default on GRAPH)", () => {
  // Redesign · the stratum-chrome assertion is dropped (that chrome is never rendered, detail
  // or not). Evidence plates are still gated on `detail` exactly as before, and the
  // ungrounded-drop is gated on selection/hover — with detail off and nothing selected, both
  // stay absent, so the rest of this test's assertion still holds.
  it("hides the evidence plates and ungrounded drops when detail is off", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} detail={false} />,
    );
    expect(container.querySelectorAll("[data-testid='evidence-plate']").length).toBe(0);
    expect(container.querySelectorAll("[data-testid='ungrounded-drop']").length).toBe(0);
  });

  // Redesign · the constraint rail (ConstraintFrame) is gone outright — it no longer mounts
  // regardless of `detail` or supplied planes. Covered generically below by the "constraint
  // planes" describe block's own removal; the detail-specific variant here is now redundant
  // with an unconditional "never renders" fact, so it's dropped rather than kept as a
  // misleadingly-named pass.

  it("hides the force arrows when detail is off, even under load", () => {
    const { container } = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set()}
        loadApplied
        detail={false}
      />,
    );
    expect(container.querySelector("[data-testid='force-arrows']")).toBeNull();
  });

  it("renders one status dot per node in the minimal board", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} detail={false} />,
    );
    expect(container.querySelectorAll("[data-testid='node-status-dot']").length).toBe(
      graph.nodes.length,
    );
  });

  // Redesign · the stratum-chrome half of this assertion is dropped (chrome is gone
  // entirely); the evidence-plates-return-with-detail behavior is unchanged and kept.
  it("brings the evidence plates back when detail is on (the DETAIL toggle)", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} detail />,
    );
    expect(container.querySelectorAll("[data-testid='evidence-plate']").length).toBe(6);
  });

  it("expands ONLY the selected node inline while the rest of the board stays minimal", () => {
    const { container } = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set()}
        detail={false}
        selectedId="a_load"
      />,
    );
    // The keystone is always marked (its marker is a load-bearing signal) but not "expanded";
    // only the selected node carries data-expanded in the minimal board.
    const expanded = container.querySelectorAll("[data-expanded='true']");
    expect(expanded.length).toBe(1);
  });
});

describe("KeystoneCanvas (W3-5 Band 1 flat mode, ≤8 nodes)", () => {
  // V7-1 · every scenario fixture is now Band 2 (≥9 nodes), so the Band-1 flat-mode
  // contract is exercised against a small inline graph (thesis + 2 claims + 3 leaf
  // assumptions, one grounded). Same intent: ≤8 nodes render flat with stratum chrome.
  const flatGraph: Graph = {
    thesisId: "T",
    nodes: [
      { id: "T", type: "thesis", label: "Small decision", confidence: 1, groups: [{ kind: "AND", childIds: ["c1", "c2"] }] },
      { id: "c1", type: "claim", label: "Claim one", confidence: 1, groups: [{ kind: "AND", childIds: ["k"] }] },
      { id: "c2", type: "claim", label: "Claim two", confidence: 1, groups: [{ kind: "OR", childIds: ["a1", "a2"] }] },
      { id: "k", type: "assumption", label: "keystone", confidence: 0.8, groups: [], evidence: [{ source: "notes", fact: "grounded fact" }] },
      { id: "a1", type: "assumption", label: "a1", confidence: 0.8, groups: [], evidence: null },
      { id: "a2", type: "assumption", label: "a2", confidence: 0.8, groups: [], evidence: null },
    ],
  };

  it("selects the simple-2d band for a ≤8-node graph", () => {
    expect(flatGraph.nodes.length).toBeLessThanOrEqual(8);
    expect(pickLayoutMode(flatGraph.nodes.length)).toBe("simple-2d");
  });

  it("renders truly flat — perspective off, no tilt transform — even with tilt on", () => {
    const { container } = render(
      <KeystoneCanvas graph={flatGraph} keystoneId="k" failures={new Set()} tilt />,
    );
    const wrap = container.querySelector<HTMLElement>("[data-canvas-perspective]");
    expect(wrap!.style.perspective).toBe("none");
    const tiltLayer = container.querySelector<HTMLElement>("[data-canvas-tilt]");
    // Band 1 forces the board flat regardless of the tilt prop.
    expect(tiltLayer!.style.transform).toBe("none");
  });

  // Redesign · the stratum-chrome half of this test is dropped (that chrome is gone
  // entirely, Band 1 or not); the evidence-plates-still-show-in-flat-PLAN behavior is
  // unchanged (plates are gated on `detail`, which defaults true here) and kept.
  it("still shows evidence plates in the flat PLAN layout (V4-1 §6)", () => {
    const { container } = render(
      <KeystoneCanvas graph={flatGraph} keystoneId="k" failures={new Set()} tilt />,
    );
    // The inline graph grounds only its keystone (k); the rest float.
    expect(container.querySelectorAll("[data-testid='evidence-plate']").length).toBe(1);
  });
});

// V7-2 · BUG 3 regression — a long node label used to spill past the 72px box toward the
// evidence plate. The label div clamps to 2 lines (webkit-box + overflow hidden) and carries
// the full text as a hover title; the outer box keeps NO overflow clip so the plate/glow/callout
// (absolutely positioned outside the box) are never cut off.
describe("StructuralNode long-label clamp (V7-2 BUG 3)", () => {
  it("clamps an overlong assumption label to 2 lines and exposes the full text on hover", () => {
    const g = fixtureContextGraph();
    const long =
      "This assumption label is deliberately far too long to fit inside the node box in a single line and would otherwise spill downward.";
    g.nodes.find((n) => n.id === "a_load")!.label = long;
    const { container } = render(
      <KeystoneCanvas graph={g} keystoneId="k_credible" failures={new Set()} />,
    );
    const el = Array.from(container.querySelectorAll<HTMLElement>("[title]")).find(
      (e) => e.getAttribute("title") === long,
    );
    expect(el).toBeTruthy();
    expect(el!.style.webkitLineClamp).toBe("2");
    expect(el!.style.overflow).toBe("hidden");
    // Full text still present in the DOM (clamp is visual only) — no data loss.
    expect(el!.textContent).toBe(long);
  });
});

describe("collapseDelayFor (W1-2 ripple stagger)", () => {
  it("fires the keystone FIRST (delay 0) regardless of its layer/index", () => {
    expect(collapseDelayFor({ isKeystone: true, layer: 2, indexInLayer: 3 })).toBe(0);
    expect(collapseDelayFor({ isKeystone: true, layer: 0, indexInLayer: 0 })).toBe(0);
  });

  it("increases monotonically by layer (bottom-up, GOAL criterion 5)", () => {
    const l0 = collapseDelayFor({ isKeystone: false, layer: 0, indexInLayer: 0 });
    const l1 = collapseDelayFor({ isKeystone: false, layer: 1, indexInLayer: 0 });
    const l2 = collapseDelayFor({ isKeystone: false, layer: 2, indexInLayer: 0 });
    expect(l0).toBe(0);
    expect(l1).toBeGreaterThan(l0);
    expect(l2).toBeGreaterThan(l1);
  });

  it("increases monotonically by index within a layer", () => {
    const i0 = collapseDelayFor({ isKeystone: false, layer: 1, indexInLayer: 0 });
    const i1 = collapseDelayFor({ isKeystone: false, layer: 1, indexInLayer: 1 });
    const i2 = collapseDelayFor({ isKeystone: false, layer: 1, indexInLayer: 2 });
    expect(i1).toBeGreaterThan(i0);
    expect(i2).toBeGreaterThan(i1);
  });

  it("matches the specced formula layer*0.18 + indexInLayer*0.06", () => {
    expect(collapseDelayFor({ isKeystone: false, layer: 2, indexInLayer: 3 })).toBeCloseTo(0.54);
  });
});

describe("buildDelayFor (W1-6a assembly build-in stagger)", () => {
  it("lands the foundation first (layer 0 index 0 = 0)", () => {
    expect(buildDelayFor({ layer: 0, indexInLayer: 0 })).toBe(0);
  });

  it("raises the structure bottom-up (monotonic by layer)", () => {
    const l0 = buildDelayFor({ layer: 0, indexInLayer: 0 });
    const l1 = buildDelayFor({ layer: 1, indexInLayer: 0 });
    const l2 = buildDelayFor({ layer: 2, indexInLayer: 0 });
    expect(l1).toBeGreaterThan(l0);
    expect(l2).toBeGreaterThan(l1);
  });

  it("increases monotonically by index within a layer", () => {
    const i0 = buildDelayFor({ layer: 1, indexInLayer: 0 });
    const i1 = buildDelayFor({ layer: 1, indexInLayer: 1 });
    expect(i1).toBeGreaterThan(i0);
  });
});

describe("causal callout on the crack (W1-5)", () => {
  const rawAttacks: Attack[] = [
    { id: "atk_k", targetId: "k_credible", category: "execution risk", severity: 0.43, rationale: "" },
  ];
  const reweighted: Attack[] = [
    { id: "atk_k", targetId: "k_credible", category: "execution risk", severity: 0.645, rationale: "" },
  ];
  const adjustments: ContextWeightAdjustment[] = [
    {
      targetCategory: "execution",
      direction: "increase",
      magnitude: 1.0,
      reason: "A major customer meeting tomorrow maximally raises near-term execution risk.",
    },
  ];

  it("annotates the cracked keystone with the real context reason + severity delta", () => {
    const { container } = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set(["k_credible"])}
        attacks={reweighted}
        rawAttacks={rawAttacks}
        contextAdjustments={adjustments}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("CRACKED");
    expect(text).toContain("EXECUTION SEVERITY 0.43→" + "0.65");
    // Reason string comes from real pack data, not a hardcode.
    expect(text.toUpperCase()).toContain("MEETING TOMORROW");
  });

  it("shows NO callout when the keystone holds", () => {
    const { container } = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set()}
        attacks={reweighted}
        rawAttacks={rawAttacks}
        contextAdjustments={adjustments}
      />,
    );
    expect(container.querySelector("[data-testid='causal-callout']")).toBeNull();
    expect(container.textContent ?? "").not.toContain("CRACKED");
  });

  it("falls back to a neutral THRESHOLD CROSSED label with no context adjustments", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set(["k_credible"])} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("THRESHOLD CROSSED");
    expect(text).not.toContain("CRACKED");
  });
});

// Redesign · the ConstraintFrame (right-gutter "CONSTRAINTS" planes / numbered rules /
// strike-lines / plane legend) is no longer rendered at all — the component still exists in
// KeystoneCanvas.tsx but nothing mounts it. The entire "constraint planes (V4-2 — ideas have
// constraints)" describe block asserted presence of that removed chrome (labeled planes,
// VIOLATED strike tallies, strike-lines, calm-before-load state) and is removed wholesale;
// none of that behavior exists anymore, so there's nothing true left to assert beyond the
// generic "never renders" fact already covered above.

describe("force arrows (W1-6b)", () => {
  it("renders force arrows while load is applied and hides them otherwise", () => {
    const applied = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} loadApplied />,
    );
    expect(applied.container.querySelector("[data-testid='force-arrows']")).not.toBeNull();
    cleanup();

    const idle = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set()}
        loadApplied={false}
      />,
    );
    expect(idle.container.querySelector("[data-testid='force-arrows']")).toBeNull();
  });
});
