// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SystemAtWork } from "./SystemAtWork";

// React 19 + Testing Library act() environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

describe("SystemAtWork — the auto-playing pipeline", () => {
  it("mounts at tick 0 and renders the three agent lanes, a real source, and the duel cast", () => {
    const { container } = render(<SystemAtWork />);
    const text = container.textContent ?? "";

    // The section root (e2e handle).
    expect(container.querySelector('[data-testid="system-at-work"]')).not.toBeNull();

    // Stage 1 · the three GATHER agent lanes.
    expect(text).toContain("TECHNICAL");
    expect(text).toContain("BUSINESS");
    expect(text).toContain("TEMPORAL");

    // At least one REAL, source-attributed finding (rendered verbatim from the agent fixtures).
    expect(text).toContain("pyproject.toml");
    // ...and a real competitor URL + the "meeting tomorrow" temporal beat.
    expect(text).toMatch(/ledgerline\.example\.com/);
    expect(text).toMatch(/Enterprise customer meeting — tomorrow/);

    // Stage 4 · WIND TUNNEL role markers (the fixed duel cast is always in the DOM).
    expect(text).toContain("PROSECUTOR");
    expect(text).toContain("SOLVER");
    expect(text).toContain("ADVOCATE");

    // Stage 3 · the three rival candidates each mount their mini-structure.
    expect(container.querySelector('[data-testid="rival-aggressive"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rival-conservative"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rival-hybrid"]')).not.toBeNull();
  });

  it("surfaces all five pipeline stages by name", () => {
    const { container } = render(<SystemAtWork />);
    const text = container.textContent ?? "";
    for (const stage of ["GATHER", "COMPILE", "GENERATE", "WIND TUNNEL", "VERDICT"]) {
      expect(text).toContain(stage);
    }
  });
});
