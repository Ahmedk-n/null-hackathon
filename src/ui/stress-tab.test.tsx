// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { StressTab } from "./tabs/StressTab";
import { keystoneStore } from "@/store/useKeystone";
import { fixtureContextGraph, fixtureContextAttacks } from "@/context";

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

// Seed the shared singleton store via its actions before each render (selectors
// read the singleton, so seeding it first is enough).
beforeEach(() => {
  keystoneStore.getState().setGraph(fixtureContextGraph());
  keystoneStore.getState().applyLoad(fixtureContextAttacks());
});

afterEach(cleanup);

describe("StressTab (R4)", () => {
  it("renders an APPLY LOAD button", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.getByRole("button", { name: /apply load/i })).toBeDefined();
  });

  it("shows at least one attack row with a mono severity value", () => {
    const { container } = render(
      <StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />,
    );
    const monos = Array.from(container.querySelectorAll(".mono"));
    const severities = monos.filter((el) => /^\d\.\d{2}$/.test(el.textContent ?? ""));
    expect(severities.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the integrity value", () => {
    const { container } = render(
      <StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />,
    );
    // IntegrityGauge renders its label + a numeric percentage.
    expect(screen.getByText(/structural integrity/i)).toBeDefined();
    const integrity = keystoneStore.getState().workingGraph
      ? Math.round(
          Array.from(container.querySelectorAll("text"))
            .map((t) => Number(t.textContent))
            .find((n) => !Number.isNaN(n)) ?? -1,
        )
      : -1;
    expect(integrity).toBeGreaterThanOrEqual(0);
  });
});
