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

    // Exactly 3 primary tabs (queried by the data-tab attribute on Tabs buttons).
    const tabs = container.querySelectorAll("[data-tab]");
    expect(tabs.length).toBe(3);

    // At least one ledger row is present (status strip / ledger primitives).
    expect(container.querySelectorAll(".ledger-row").length).toBeGreaterThanOrEqual(1);

    // Numerals carry the .mono class (tabular-nums styling).
    expect(container.querySelectorAll(".mono").length).toBeGreaterThanOrEqual(1);

    // manual: verify border-radius:0 in browser (jsdom does not load external CSS
    // so computed border-radius is not assertable here).
  });
});
