// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { KeystoneCanvas, collapseDelayFor, buildDelayFor } from "./KeystoneCanvas";
import { pickLayoutMode } from "./layout";
import { fixtureContextGraph } from "@/context";
import type { Attack, Graph } from "@/engine";
import type { ContextWeightAdjustment } from "@/context";
import type { ConstraintPlane } from "@/context/constraints";

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

  it("renders the L0..L3 stratum chrome labels", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} />,
    );
    const chrome = container.querySelector<HTMLElement>("[data-testid='stratum-chrome']");
    expect(chrome).not.toBeNull();
    const text = chrome!.textContent ?? "";
    expect(text).toContain("L0 THESIS");
    expect(text).toContain("L1 CLAIMS");
    expect(text).toContain("L2 ASSUMPTIONS");
    // Hero A carries evidence → the fourth (evidence) stratum is present.
    expect(text).toContain("L3 EVIDENCE");
  });

  it("renders an evidence plate for each grounded assumption, and none for ungrounded", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} />,
    );
    // Hero A (V7-1 deepened): k_credible + the four evidence-support sub-leaves
    // (s_tracing, s_metrics, s_domain, s_split) + a_audit are grounded (6); a_load is ungrounded.
    const plates = container.querySelectorAll("[data-testid='evidence-plate']");
    expect(plates.length).toBe(6);
    const ungrounded = container.querySelectorAll("[data-testid='ungrounded-drop']");
    expect(ungrounded.length).toBe(1);
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
      { id: "k", type: "assumption", label: "keystone", confidence: 0.8, groups: [], evidence: { source: "notes", fact: "grounded fact" } },
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

  it("still shows stratum chrome + evidence plates in the flat PLAN layout (V4-1 §6)", () => {
    const { container } = render(
      <KeystoneCanvas graph={flatGraph} keystoneId="k" failures={new Set()} tilt />,
    );
    const chrome = container.querySelector<HTMLElement>("[data-testid='stratum-chrome']");
    expect(chrome!.textContent ?? "").toContain("L0 THESIS");
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

describe("constraint planes (V4-2 — ideas have constraints)", () => {
  const planes: ConstraintPlane[] = [
    { id: "con_time", label: "TIME · CREDIBLE PLAN NEEDED…", categories: ["timeline", "execution"] },
    { id: "con_reg", label: "REG · REGULATED FINTECH BUY…", categories: ["auditability", "reliability"] },
  ];

  it("renders a labeled boundary plane per constraint when the pack has constraints", () => {
    const { container } = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set()}
        constraintPlanes={planes}
      />,
    );
    const frame = container.querySelector("[data-testid='constraint-planes']");
    expect(frame).not.toBeNull();
    expect(container.querySelector("[data-constraint-plane='con_time']")).not.toBeNull();
    expect(container.querySelector("[data-constraint-plane='con_reg']")).not.toBeNull();
    const text = frame!.textContent ?? "";
    expect(text).toContain("TIME · CREDIBLE PLAN NEEDED…");
    expect(text).toContain("REG · REGULATED FINTECH BUY…");
  });

  it("renders NO constraint frame when there are no planes", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} />,
    );
    expect(container.querySelector("[data-testid='constraint-planes']")).toBeNull();
  });

  it("marks a plane VIOLATED with a strike tally + strike-line when a matching attack lands under load", () => {
    const attacks: Attack[] = [
      { id: "atk_k", targetId: "k_credible", category: "execution risk", severity: 0.65, rationale: "" },
      { id: "atk_bound", targetId: "a_bound", category: "second-order", severity: 0.2, rationale: "" },
      { id: "atk_audit", targetId: "a_audit", category: "auditability", severity: 0.1, rationale: "" },
    ];
    const { container } = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set()}
        loadApplied
        attacks={attacks}
        constraintPlanes={planes}
      />,
    );
    const time = container.querySelector<HTMLElement>("[data-constraint-plane='con_time']");
    const reg = container.querySelector<HTMLElement>("[data-constraint-plane='con_reg']");
    // execution + second-order(→execution) both strike the TIME plane → ×2 VIOLATED.
    expect(time!.getAttribute("data-violated")).toBe("true");
    expect(time!.textContent ?? "").toContain("VIOLATED ×2");
    // auditability strikes the REG plane → ×1 VIOLATED.
    expect(reg!.getAttribute("data-violated")).toBe("true");
    expect(reg!.textContent ?? "").toContain("VIOLATED ×1");
    // brief strike-lines are drawn from the struck planes to the attacked nodes.
    expect(container.querySelectorAll("[data-testid='constraint-strike-line']").length).toBeGreaterThan(0);
  });

  it("shows planes calm (not violated) before load is applied", () => {
    const attacks: Attack[] = [
      { id: "atk_k", targetId: "k_credible", category: "execution risk", severity: 0.65, rationale: "" },
    ];
    const { container } = render(
      <KeystoneCanvas
        graph={graph}
        keystoneId="k_credible"
        failures={new Set()}
        loadApplied={false}
        attacks={attacks}
        constraintPlanes={planes}
      />,
    );
    const time = container.querySelector<HTMLElement>("[data-constraint-plane='con_time']");
    expect(time!.getAttribute("data-violated")).toBeNull();
    expect(container.querySelector("[data-testid='constraint-strike-line']")).toBeNull();
  });
});

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
