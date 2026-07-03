// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { ContextTab } from "./tabs/ContextTab";
import { SCENARIOS } from "@/context/fixtures";

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

  // ── V3-5 · mode selection (A / B / CUSTOM) ──────────────────────────────
  it("renders the MODE selector (A/B/CUSTOM) only when onModeChange is provided", () => {
    // No handler → no selector (keeps the bare-props usage untouched).
    const bare = render(<ContextTab onAnalyse={() => {}} analysing={false} />);
    expect(bare.container.querySelector('[data-testid="scenario-select"]')).toBeNull();
    // The mode buttons carry no data-tab, so the sub-tab count stays 4.
    expect(bare.container.querySelectorAll("[data-tab]").length).toBe(4);
    cleanup();

    const { container } = render(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="A" onModeChange={() => {}} />,
    );
    const select = container.querySelector('[data-testid="scenario-select"]');
    expect(select).toBeTruthy();
    expect(container.querySelector('[data-scenario="A"]')).toBeTruthy();
    expect(container.querySelector('[data-scenario="B"]')).toBeTruthy();
    expect(container.querySelector('[data-scenario="custom"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-tab]").length).toBe(4);
  });

  it("clicking scenario B calls onModeChange('B')", () => {
    let picked: string | null = null;
    const { container } = render(
      <ContextTab
        onAnalyse={() => {}}
        analysing={false}
        mode="A"
        onModeChange={(m) => (picked = m)}
      />,
    );
    fireEvent.click(container.querySelector('[data-scenario="B"]')!);
    expect(picked).toBe("B");
  });

  it("seeds the decision textarea from the selected scenario (A hero, B reinforce)", () => {
    const { container } = render(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="B" onModeChange={() => {}} />,
    );
    fireEvent.click(container.querySelector('[data-tab="decision"]')!);
    const decision = [...container.querySelectorAll("textarea")].find(
      (t) => (t as HTMLTextAreaElement).value === SCENARIOS.B.input.decisionText,
    );
    expect(decision).toBeTruthy();
  });

  // ── V3-5 · mode chip ────────────────────────────────────────────────────
  it("shows a PINNED · SCENARIO A chip on mode A and CUSTOM · LIVE on custom", () => {
    const pinned = render(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="A" onModeChange={() => {}} />,
    );
    const chipA = pinned.container.querySelector('[data-testid="mode-chip"]')!;
    expect(chipA.textContent).toMatch(/PINNED · SCENARIO A/i);
    cleanup();

    const custom = render(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="custom" onModeChange={() => {}} />,
    );
    const chipC = custom.container.querySelector('[data-testid="mode-chip"]')!;
    expect(chipC.textContent).toMatch(/CUSTOM · LIVE/i);
  });

  // ── V3-5 · CUSTOM clears the textareas ──────────────────────────────────
  it("selecting CUSTOM clears the seeded textareas and reports mode 'custom'", () => {
    let picked: string | null = null;
    const { container } = render(
      <ContextTab
        onAnalyse={() => {}}
        analysing={false}
        mode="A"
        onModeChange={(m) => (picked = m)}
      />,
    );
    // The DECISION sub-tab has exactly one textarea — seeded from scenario A.
    fireEvent.click(container.querySelector('[data-tab="decision"]')!);
    const before = (container.querySelector("textarea") as HTMLTextAreaElement).value;
    expect(before.length).toBeGreaterThan(0);

    fireEvent.click(container.querySelector('[data-scenario="custom"]')!);
    expect(picked).toBe("custom");
    fireEvent.click(container.querySelector('[data-tab="decision"]')!);
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
  });

  // ── V3-5 · editing while PINNED auto-flips to CUSTOM (text preserved) ────
  it("editing a textarea while pinned to A flips the mode to custom without wiping the edit", () => {
    let picked: string | null = null;
    const { container } = render(
      <ContextTab
        onAnalyse={() => {}}
        analysing={false}
        mode="A"
        onModeChange={(m) => (picked = m)}
      />,
    );
    // Use the DECISION sub-tab (single textarea) to avoid the AgentGather inputs.
    fireEvent.click(container.querySelector('[data-tab="decision"]')!);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "judge typed a real decision" } });
    // The parent is told to drop the scenario pin…
    expect(picked).toBe("custom");
    // …and the user's keystroke survives (no re-seed on the edit-driven flip).
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "judge typed a real decision",
    );
  });

  // ANALYSE hands the current four textareas to the parent unchanged.
  it("ANALYSE emits the four textareas as a ContextInput", () => {
    let got: unknown = null;
    const { getByText } = render(
      <ContextTab onAnalyse={(i) => (got = i)} analysing={false} mode="A" onModeChange={() => {}} />,
    );
    fireEvent.click(getByText("ANALYSE"));
    expect(got).toMatchObject({
      businessContextText: SCENARIOS.A.input.businessContextText,
      decisionText: SCENARIOS.A.input.decisionText,
    });
  });
});
