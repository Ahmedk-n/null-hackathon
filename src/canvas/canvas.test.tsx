// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { KeystoneCanvas, collapseDelayFor, buildDelayFor } from "./KeystoneCanvas";
import { pickLayoutMode } from "./layout";
import { fixtureContextGraph } from "@/context";
import type { Attack } from "@/engine";
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

describe("KeystoneCanvas (T10 adaptive dimensionality)", () => {
  it("selects the 2.5D band for the 9-node fixture graph", () => {
    expect(graph.nodes.length).toBe(9);
    expect(pickLayoutMode(graph.nodes.length)).toBe("layered-2-5d");
  });

  it("wraps the viewport in a perspective container", () => {
    const { container } = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} />,
    );
    const wrap = container.querySelector<HTMLElement>("[data-canvas-perspective]");
    expect(wrap).not.toBeNull();
    expect(wrap!.style.perspective).toBe("1400px");
  });

  it("applies the CAD tilt when tilt is on and flattens it when off", () => {
    const on = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} tilt />,
    );
    const tiltedLayer = on.container.querySelector<HTMLElement>("[data-canvas-tilt]");
    expect(tiltedLayer!.style.transform).toContain("rotate");
    cleanup();

    const off = render(
      <KeystoneCanvas graph={graph} keystoneId="k_credible" failures={new Set()} tilt={false} />,
    );
    const flatLayer = off.container.querySelector<HTMLElement>("[data-canvas-tilt]");
    expect(flatLayer!.style.transform).toBe("none");
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
