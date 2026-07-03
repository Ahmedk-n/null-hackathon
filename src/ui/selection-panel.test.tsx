// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SelectionPanel } from "./SelectionPanel";
import { fixtureContextGraph } from "@/context";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

const graph = fixtureContextGraph();

describe("SelectionPanel — confidence provenance (V3-6)", () => {
  it("renders a GROUNDED row with the fact + source for an assumption with evidence", () => {
    const { container, getByText } = render(
      <SelectionPanel graph={graph} selectedNodeId="k_credible" keystoneId="k_credible" />,
    );
    // grounded state marker present, ungrounded absent
    expect(container.querySelector('[data-evidence="grounded"]')).not.toBeNull();
    expect(container.querySelector('[data-evidence="ungrounded"]')).toBeNull();
    // the grounded label carries the confidence + GROUNDED
    expect(getByText(/0\.90 · GROUNDED/)).toBeTruthy();
    // fact text and bracketed source both render
    expect(getByText(/Credible near-term technical plan needed by the meeting/)).toBeTruthy();
    expect(getByText(/\[notes\]/)).toBeTruthy();
  });

  it("renders an UNGROUNDED — ASSUMED row for an assumption with null evidence", () => {
    const { container, getByText } = render(
      <SelectionPanel graph={graph} selectedNodeId="a_load" keystoneId="k_credible" />,
    );
    expect(container.querySelector('[data-evidence="ungrounded"]')).not.toBeNull();
    expect(container.querySelector('[data-evidence="grounded"]')).toBeNull();
    expect(getByText(/0\.85 · UNGROUNDED — ASSUMED/)).toBeTruthy();
  });

  it("keeps a plain confidence row for non-assumption nodes (no grounding markers)", () => {
    const { container } = render(
      <SelectionPanel graph={graph} selectedNodeId="T" keystoneId="k_credible" />,
    );
    expect(container.querySelector('[data-evidence="grounded"]')).toBeNull();
    expect(container.querySelector('[data-evidence="ungrounded"]')).toBeNull();
  });
});
