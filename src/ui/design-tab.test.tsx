// @vitest-environment jsdom
// V6-1 · DesignTab — render + tournament. Mocks POST /api/design to return the pinned candidates,
// then drives the deterministic tournament clock (real timers) until the verdict stamps settle and
// asserts exactly ONE ✓ STANDS survivor + OPEN IN STUDIO handoff.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { DesignTab, type OpenCandidate } from "./tabs/DesignTab";
import { fixtureDesignCandidatesR } from "@/context/fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mockDesignFetch() {
  const candidates = fixtureDesignCandidatesR().map((c) => ({ ...c, source: "fixture" as const }));
  global.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        headers: { get: () => "fixture" },
        json: async () => ({ candidates }),
      }) as unknown as Response,
  ) as unknown as typeof fetch;
}

beforeEach(mockDesignFetch);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DesignTab (V6-1)", () => {
  it("renders the explainer, GENERATE RIVALS, and seeds the R goal", () => {
    const { getByText, getByRole, getByTestId } = render(<DesignTab mode="R" onOpenInStudio={() => {}} />);
    expect(getByText(/three rival structures for the same goal/i)).toBeTruthy();
    expect(getByRole("button", { name: /Generate Rivals/i })).toBeTruthy();
    const goal = getByTestId("design-goal") as HTMLTextAreaElement;
    expect(goal.value).toMatch(/without burning the 6-person team/i);
  });

  it("runs the tournament → 3 candidates, exactly one ✓ STANDS survivor", async () => {
    const { getByRole, container } = render(<DesignTab mode="R" onOpenInStudio={() => {}} />);
    fireEvent.click(getByRole("button", { name: /Generate Rivals/i }));

    // Three candidate structures assemble (after the async /api/design fetch resolves).
    await waitFor(
      () => expect(container.querySelectorAll('[data-testid="candidate-mini"]').length).toBe(3),
      { timeout: 6000 },
    );

    // Verdict stamps settle: exactly one STANDS, one STRESSED, one COLLAPSED.
    await waitFor(
      () => expect(container.querySelectorAll('[data-testid="candidate-stamp"]').length).toBe(3),
      { timeout: 6000 },
    );
    const bands = [...container.querySelectorAll('[data-testid="candidate-stamp"]')].map((el) =>
      el.getAttribute("data-band"),
    );
    expect(bands.filter((b) => b === "STANDS").length).toBe(1);
    expect(bands.sort()).toEqual(["COLLAPSED", "STANDS", "STRESSED"]);
  });

  it("OPEN IN STUDIO on the survivor hands back the conservative candidate", async () => {
    let opened: OpenCandidate | null = null;
    const { getByRole, container } = render(
      <DesignTab mode="R" onOpenInStudio={(c) => (opened = c)} />,
    );
    fireEvent.click(getByRole("button", { name: /Generate Rivals/i }));
    await waitFor(
      () => expect(container.querySelector('[data-testid="open-in-studio"][data-survivor="true"]')).not.toBeNull(),
      { timeout: 6000 },
    );
    const survivorBtn = container
      .querySelector('[data-testid="open-in-studio"][data-survivor="true"]')!
      .closest("button")!;
    fireEvent.click(survivorBtn);
    expect(opened).not.toBeNull();
    expect(opened!.label).toBe("HARDEN MANAGED INFRA FIRST");
  });

  it("shows per-candidate source chips (CACHED for the pinned set)", async () => {
    const { getByRole, container } = render(<DesignTab mode="R" onOpenInStudio={() => {}} />);
    fireEvent.click(getByRole("button", { name: /Generate Rivals/i }));
    await waitFor(
      () => expect(container.querySelectorAll('[data-testid="candidate-source"]').length).toBe(3),
      { timeout: 6000 },
    );
    for (const chip of container.querySelectorAll('[data-testid="candidate-source"]')) {
      expect(within(chip as HTMLElement).getByText(/CACHED/i)).toBeTruthy();
    }
  });
});
