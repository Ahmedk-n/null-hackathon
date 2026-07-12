// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, cleanup, fireEvent, within, act } from "@testing-library/react";
import { ContextTab } from "./tabs/ContextTab";
import { SCENARIOS } from "@/context/fixtures";
import { RUN_DEADLINE_MS } from "@/lib/useAgentStream";

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

  it("renders R as the FIRST mode segment and seeds the real Excalidraw decision", () => {
    const { container } = render(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="R" onModeChange={() => {}} />,
    );
    // R exists and is the first segment in the mode control.
    const segs = [...container.querySelectorAll("[data-scenario]")];
    expect(segs[0].getAttribute("data-scenario")).toBe("R");
    // C-2: segments are now terser two-line labels (id+name / outcome) so the outcome never
    // ellipsis-clips — assert both substrings are present rather than a fixed ordering.
    const rSeg = container.querySelector('[data-scenario="R"]')!.textContent ?? "";
    expect(rSeg).toMatch(/EXCALIDRAW/i);
    expect(rSeg).toMatch(/REAL/i);
    // The decision sub-tab seeds from the real scenario input.
    fireEvent.click(container.querySelector('[data-tab="decision"]')!);
    const decision = [...container.querySelectorAll("textarea")].find(
      (t) => (t as HTMLTextAreaElement).value === SCENARIOS.R.input.decisionText,
    );
    expect(decision).toBeTruthy();
    expect((decision as HTMLTextAreaElement).value).toMatch(/excalidraw/i);
  });

  it("clicking scenario R calls onModeChange('R') and shows PINNED · SCENARIO R", () => {
    let picked: string | null = null;
    const { container } = render(
      <ContextTab
        onAnalyse={() => {}}
        analysing={false}
        mode="R"
        onModeChange={(m) => (picked = m)}
      />,
    );
    expect(container.querySelector('[data-testid="mode-chip"]')!.textContent).toMatch(
      /PINNED · SCENARIO R/i,
    );
    fireEvent.click(container.querySelector('[data-scenario="A"]')!);
    expect(picked).toBe("A");
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

  // ── Excalidraw (R) source fields are PREFILLED with real data ───────────
  it("prefills the AgentGather source fields with the real Excalidraw values on mode R", () => {
    const { container } = render(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="R" onModeChange={() => {}} />,
    );
    // BUSINESS pane (default sub-tab): website + competitors prefilled from the scenario sources.
    const findInput = (val: string) =>
      [...container.querySelectorAll("input, textarea")].find(
        (el) => (el as HTMLInputElement).value === val,
      );
    expect(findInput(SCENARIOS.R.sources!.business!.website!)).toBeTruthy();
    expect(findInput("https://excalidraw.com")).toBeTruthy();
    expect(findInput(SCENARIOS.R.sources!.business!.competitors!.join(", "))).toBeTruthy();

    // TECHNICAL pane: repo URL + branch prefilled.
    fireEvent.click(container.querySelector('[data-tab="technical"]')!);
    expect(findInput("https://github.com/excalidraw/excalidraw")).toBeTruthy();
    expect(findInput("master")).toBeTruthy();

    // TEMPORAL pane: the real roadmap notes prefilled.
    fireEvent.click(container.querySelector('[data-tab="temporal"]')!);
    expect(findInput(SCENARIOS.R.sources!.temporal!.notes!)).toBeTruthy();
  });

  it("re-seeds the source fields when switching to R, and clears them on CUSTOM", () => {
    // Start on custom (blank source fields), then switch to R → fields fill with real data.
    let mode: "R" | "custom" = "custom";
    const { container, rerender } = render(
      <ContextTab
        onAnalyse={() => {}}
        analysing={false}
        mode={mode}
        onModeChange={(m) => (mode = m as "R" | "custom")}
      />,
    );
    const website = () =>
      ([...container.querySelectorAll("input")].find((i) =>
        (i as HTMLInputElement).placeholder?.includes("acme"),
      ) as HTMLInputElement | undefined)?.value;
    expect(website()).toBe(""); // custom → blank

    rerender(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="R" onModeChange={() => {}} />,
    );
    expect(website()).toBe("https://excalidraw.com");

    // …and switching back to custom re-blanks them.
    rerender(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="custom" onModeChange={() => {}} />,
    );
    expect(website()).toBe("");
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

  // ── Agent-run regressions (live demo QA) ────────────────────────────────
  it("keeps the agent pane mounted across a parent re-render (log persists after a run finishes)", () => {
    const { getByText, getByPlaceholderText } = render(
      <ContextTab onAnalyse={() => {}} analysing={false} mode="A" onModeChange={() => {}} />,
    );
    // The business sub-tab is active by default → exactly one RUN AGENT button.
    const runBtnBefore = getByText("RUN AGENT");

    // A finished gather calls onSummary → setBusiness (parent state) → ContextTab re-renders.
    // Editing the manual textarea drives the SAME setBusiness path, so it reproduces that render.
    fireEvent.change(getByPlaceholderText(/layer your own context/i), {
      target: { value: "user layered note" },
    });

    // Before the hoist, ContextPane was declared inside the render body, so this re-render minted
    // a new component type and REMOUNTED the pane — a new button node, and AgentGather's streamed
    // log/findings wiped. Hoisted to module scope → the same DOM node survives the re-render.
    const runBtnAfter = getByText("RUN AGENT");
    expect(runBtnAfter).toBe(runBtnBefore);
  });

  it("ticks a live heartbeat while a run is in flight (so the silent web-search gap looks alive)", () => {
    vi.useFakeTimers();
    try {
      const { getByText, getByTestId } = render(
        <ContextTab onAnalyse={() => {}} analysing={false} mode="A" onModeChange={() => {}} />,
      );
      // fetch is stubbed to a never-resolving promise (beforeAll), so the run stays in flight.
      fireEvent.click(getByText("RUN AGENT"));

      // Heartbeat present immediately, counting from 0.
      expect(getByTestId("agent-heartbeat").textContent).toMatch(/working… 0s/);

      // Three seconds pass with no server event — the counter must tick, proving liveness.
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(getByTestId("agent-heartbeat").textContent).toMatch(/working… 3s/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives a live agent run a deadline long enough for the slow business web agent", () => {
    // The business agent measured ~116s end-to-end and can reach ~275s in the wild; the old 75s
    // ceiling aborted every live business run mid-search. Guard against a regression to a value
    // that would kill it again.
    expect(RUN_DEADLINE_MS).toBeGreaterThanOrEqual(240_000);
  });
});
