// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoSheet } from "./memo/MemoSheet";
import { keystoneStore } from "@/store/useKeystone";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureCompanyContext,
  fixtureDecisionContextPack,
} from "@/context";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STARTED_AT = "2026-07-04T09:15:00.000Z";

// Force a clean singleton before each test — MemoSheet reads the shared store, so an
// unseeded store means the EMPTY state; seeding via actions produces a populated sheet.
beforeEach(() => {
  keystoneStore.setState({
    baseGraph: null,
    workingGraph: null,
    attacks: [],
    rawAttacks: [],
    loadApplied: false,
    reinforcementPlan: null,
    failsInDay: null,
    decisionContextPack: null,
    contextSource: null,
  });
});

afterEach(cleanup);

function seedPopulated() {
  const s = keystoneStore.getState();
  s.setGraph(fixtureContextGraph());
  s.setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
  s.setApplyContextWeights(true);
  s.applyLoad(fixtureContextAttacks());
}

describe("MemoSheet (V5-2 · decision memo drawing sheet)", () => {
  it("renders every content block heading with a populated store", () => {
    seedPopulated();
    render(<MemoSheet startedAt={STARTED_AT} />);

    expect(screen.getByTestId("memo-sheet")).toBeDefined();
    expect(screen.getByTestId("memo-verdict")).toBeDefined();
    expect(screen.getByTestId("memo-sensitivity")).toBeDefined();
    expect(screen.getByTestId("memo-derisking")).toBeDefined();
    expect(screen.getByTestId("memo-constraints")).toBeDefined();
    expect(screen.getByTestId("memo-evidence")).toBeDefined();
    expect(screen.getByTestId("memo-timeline")).toBeDefined();
    expect(screen.getByTestId("memo-attacks")).toBeDefined();
    expect(screen.getByTestId("memo-title-block")).toBeDefined();

    // Section headings read in the domain vocabulary.
    expect(screen.getByText(/knock-out sensitivity/i)).toBeDefined();
    expect(screen.getByText(/de-risking plan/i)).toBeDefined();
    expect(screen.getByText(/constraint register/i)).toBeDefined();
    expect(screen.getByText(/evidence register/i)).toBeDefined();
    expect(screen.getByText(/attack ledger/i)).toBeDefined();
  });

  it("stamps the server-passed ISO date into the title block (no client clock)", () => {
    seedPopulated();
    render(<MemoSheet startedAt={STARTED_AT} />);
    expect(screen.getByTestId("memo-title-block").textContent).toContain(STARTED_AT);
    // Grounded fixture → FAILED verdict word + a print control.
    expect(screen.getByTestId("memo-verdict").textContent).toMatch(/FAILED/);
    expect(screen.getByRole("button", { name: /print.*pdf/i })).toBeDefined();
  });

  it("renders knock-out sensitivity rows sorted by descending impact, keystone first + accented", () => {
    seedPopulated();
    render(<MemoSheet startedAt={STARTED_AT} />);
    const rows = screen.getAllByTestId("memo-sensitivity-row");
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const impacts = rows.map((row) =>
      Math.abs(Number((row.querySelector(".mono")!.textContent ?? "").replace("−", ""))),
    );
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i - 1]).toBeGreaterThanOrEqual(impacts[i]);
    }
    expect(rows[0].getAttribute("data-keystone")).toBe("true");
  });

  it("shows raw→reweighted attack severities when grounded", () => {
    seedPopulated();
    render(<MemoSheet startedAt={STARTED_AT} />);
    // The keystone attack is reweighted up under the hero pack (0.43 → 0.65).
    expect(screen.getByTestId("memo-attacks").textContent).toMatch(/→/);
  });

  it("renders the EMPTY state with a RETURN TO STUDIO link when the store is empty", () => {
    render(<MemoSheet startedAt={STARTED_AT} />);
    expect(screen.getByTestId("memo-empty")).toBeDefined();
    expect(screen.getByText(/no analysis on the board/i)).toBeDefined();
    const link = screen.getByRole("link", { name: /return to studio/i });
    expect(link.getAttribute("href")).toBe("/studio");
    // No sheet in the empty state.
    expect(screen.queryByTestId("memo-sheet")).toBeNull();
  });

  it("keeps the client memo files free of wall-clock / randomness (T8 guard)", () => {
    for (const rel of ["memo/MemoSheet.tsx", "memo/derive.ts"]) {
      const src = readFileSync(resolve(__dirname, rel), "utf8");
      expect(src).not.toMatch(/new Date\(/);
      expect(src).not.toMatch(/Date\.now\(/);
      expect(src).not.toMatch(/Math\.random\(/);
    }
  });
});
