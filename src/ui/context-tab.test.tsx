// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { ContextTab } from "./tabs/ContextTab";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks ResizeObserver/matchMedia; shim them (same pattern as canvas.test.tsx)
// in case a primitive reaches for them, and stub fetch to a never-resolving promise
// so any RUN AGENT click doesn't reject in the test environment (no server).
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
  global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

afterEach(cleanup);

describe("ContextTab (R3-UI static structure)", () => {
  it("renders the four sub-tabs, per-kind gather + manual, and an ANALYSE button", () => {
    const { container, getByText } = render(<ContextTab onAnalyse={() => {}} analysing={false} />);

    // Four inner sub-tabs (data-tab on Tabs buttons).
    const subTabs = container.querySelectorAll("[data-tab]");
    expect(subTabs.length).toBe(4);
    for (const id of ["business", "technical", "temporal", "decision"]) {
      expect(container.querySelector(`[data-tab="${id}"]`)).toBeTruthy();
    }

    // ANALYSE button always visible.
    expect(getByText("ANALYSE")).toBeTruthy();

    // Each context pane (business/technical/temporal) shows a RUN AGENT control and a
    // manual textarea. Click into each sub-tab to render its pane.
    for (const id of ["business", "technical", "temporal"]) {
      fireEvent.click(container.querySelector(`[data-tab="${id}"]`)!);
      expect(within(container).getByText("RUN AGENT")).toBeTruthy();
      expect(container.querySelectorAll("textarea").length).toBeGreaterThanOrEqual(1);
    }
  });
});
