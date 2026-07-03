// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import KeystoneApp from "./KeystoneApp";

// React 19 + Testing Library act() environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

describe("Keystone shell (T9 design conformance)", () => {
  it("renders the shell chrome with ledger tokens", () => {
    const { container } = render(
      <KeystoneApp
        startedAt="2026-07-03T22:31:00Z"
        decision="migrate to microservices"
      />,
    );

    // TopBar renders the ISO-8601 session timestamp.
    expect(container.textContent).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Exactly 3 PRIMARY tabs. The active CONTEXT pane renders its own inner sub-tabs
    // (BUSINESS/TECHNICAL/TEMPORAL/DECISION) which also carry data-tab, so filter to the
    // primary nav by its labels rather than counting every data-tab globally.
    const primaryTabs = [...container.querySelectorAll("[data-tab]")].filter((el) =>
      /context|graph|stress/i.test(el.textContent ?? ""),
    );
    expect(primaryTabs.length).toBe(3);

    // The always-present StatusStrip (footer) carries the ledger design language on every
    // tab: uppercase `.label` keys + monospace tabular `.mono` values. Ledger ROWS themselves
    // are tab-dependent (Graph/Stress/Selection), so assert the persistent chrome instead.
    expect(container.querySelectorAll("footer").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll(".label").length).toBeGreaterThanOrEqual(1);

    // Numerals carry the .mono class (tabular-nums styling) — StatusStrip guarantees ≥1.
    expect(container.querySelectorAll(".mono").length).toBeGreaterThanOrEqual(1);

    // manual: verify border-radius:0 in browser (jsdom does not load external CSS
    // so computed border-radius is not assertable here).
  });
});
