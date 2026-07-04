// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { LivePipeline } from "./LivePipeline";
import { keystoneStore } from "@/store/useKeystone";
import { fixtureContextGraph } from "@/context/fixtures";
import { integrity, supportBreakdown } from "@/engine";

// React 19 + Testing Library act() environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Fake timers so the overlay's setInterval tick counter never fires during synchronous
// assertions (tick stays 0) — deterministic, and we advance explicitly for the dismiss beat.
beforeEach(() => {
  vi.useFakeTimers();
  // Seed the REAL store with a known graph — the MATH beat renders the engine output on THIS.
  keystoneStore.getState().setGraph(fixtureContextGraph());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const baseProps = {
  stage: "done" as const,
  stageSource: { context: "fixture" as const, extract: "fixture" as const, attacks: null },
  running: false,
  gatherFacts: [],
  onDismiss: () => {},
};

describe("LivePipeline overlay", () => {
  it("mounts during a run and renders the 5 stage names", () => {
    const { getByTestId } = render(<LivePipeline {...baseProps} />);
    const root = getByTestId("live-pipeline");
    const text = root.textContent ?? "";
    for (const name of ["GATHER", "COMPILE CONTEXT", "EXTRACT STRUCTURE", "GENERATE ATTACKS", "SOLVE"]) {
      expect(text).toContain(name);
    }
  });

  it("renders the REAL engine integrity + support numbers from the seeded graph", () => {
    const graph = fixtureContextGraph();
    const realIntegrity = integrity(graph); // ≈ 61.97 (GOAL baseline ≈62%)
    const keystoneSupport = supportBreakdown(graph).nodes.find((n) => n.id === "k_credible")!.support;

    const { getByTestId } = render(<LivePipeline {...baseProps} />);

    // The integrity readout carries the real engine value (not an invented number).
    const intText = getByTestId("live-pipeline-integrity").textContent ?? "";
    expect(intText).toContain(realIntegrity.toFixed(1));

    // The support decomposition renders the real keystone support value.
    const root = getByTestId("live-pipeline");
    expect(root.textContent ?? "").toContain(keystoneSupport.toFixed(2));
  });

  it("dismiss (SKIP) hides the overlay without cancelling the run", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<LivePipeline {...baseProps} onDismiss={onDismiss} />);

    act(() => {
      fireEvent.click(getByTestId("live-pipeline-skip"));
    });
    // Skip fades, then hands back after the fade timeout — the run in the parent is untouched.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses on real completion, but only after the minimum cinematic beat", () => {
    const onDismiss = vi.fn();
    render(<LivePipeline {...baseProps} onDismiss={onDismiss} />);

    // Before the min beat elapses, it holds even though the run is already done.
    act(() => {
      vi.advanceTimersByTime(1000); // ~12 ticks < MIN_TOTAL (34)
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Past the min beat the tick counter crosses MIN_TOTAL and schedules the fade hand-off…
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // …then the fade timeout fires on the next flush.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
