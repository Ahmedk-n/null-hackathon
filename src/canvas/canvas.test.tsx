// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { KeystoneCanvas } from "./KeystoneCanvas";
import { pickLayoutMode } from "./layout";
import { fixtureContextGraph } from "@/context";

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
