// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { SkylineView } from "./SkylineView";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has localStorage but it is empty → SkylineView seeds the SAMPLE entries.
beforeAll(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe("SkylineView (V6-3 · the skyline)", () => {
  it("renders the header, explainer, SAMPLE chip, and both nav links", () => {
    const { getByText, getByTestId, getAllByRole } = render(<SkylineView />);
    expect(getByText(/SKYLINE — YOUR STRATEGY AS ONE STRUCTURE/i)).toBeTruthy();
    expect(getByText(/A SHARED FOUNDATION is an assumption/i)).toBeTruthy();
    expect(getByTestId("sample-chip")).toBeTruthy();
    const links = getAllByRole("link");
    expect(links.some((a) => a.getAttribute("href") === "/studio")).toBe(true);
    expect(links.some((a) => a.getAttribute("href") === "/")).toBe(true);
  });

  it("renders one building per seeded sample (R / A / B)", () => {
    const { getAllByTestId } = render(<SkylineView />);
    const buildings = getAllByTestId("skyline-building");
    expect(buildings).toHaveLength(3);
    const ids = buildings.map((b) => b.getAttribute("data-entry-id")).sort();
    expect(ids).toEqual(["sample-a", "sample-b", "sample-r"]);
  });

  it("renders the shared foundation (spare capacity, spanning R + A)", () => {
    const { getAllByTestId, getByText } = render(<SkylineView />);
    expect(getAllByTestId("skyline-foundation")).toHaveLength(1);
    const rows = getAllByTestId("foundation-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(/spare capacity/i)).toBeTruthy();
    expect(getByText(/2 STRUCTURES/)).toBeTruthy();
  });

  it("cracking the foundation shows the readout and per-building rows (2 collapse)", () => {
    const { getByTestId, getAllByTestId, getByRole } = render(<SkylineView />);
    fireEvent.click(getByRole("button", { name: /CRACK IT/i }));
    const readout = getByTestId("crack-readout");
    expect(readout.textContent).toMatch(/1 ASSUMPTION FEEDS 2 STRUCTURES · 2 COLLAPSE/);
    const rows = getAllByTestId("crack-row");
    expect(rows).toHaveLength(2);
    // Both buildings collapse: each row shows a "COLLAPSE" verdict and "→ 0%".
    for (const r of rows) {
      expect(r.textContent).toMatch(/COLLAPSE/);
      expect(r.textContent).toMatch(/→\s*0%/);
    }
    // The failed buildings are flagged in the SVG.
    const failed = getAllByTestId("skyline-building").filter((b) => b.getAttribute("data-failed") === "true");
    expect(failed).toHaveLength(2);
  });

  it("RESET restores the pre-crack state", () => {
    const { getByRole, queryByTestId, getAllByTestId } = render(<SkylineView />);
    fireEvent.click(getByRole("button", { name: /CRACK IT/i }));
    expect(queryByTestId("crack-readout")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /RESET/i }));
    expect(queryByTestId("crack-readout")).toBeNull();
    const failed = getAllByTestId("skyline-building").filter((b) => b.getAttribute("data-failed") === "true");
    expect(failed).toHaveLength(0);
  });
});
