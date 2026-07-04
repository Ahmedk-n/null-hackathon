// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { SelectionPanel } from "./SelectionPanel";
import { fixtureContextGraph } from "@/context";
import type { Graph } from "@/engine";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

const graph = fixtureContextGraph();

// A graph whose keystone has been human-edited (provenance modified).
function modifiedGraph(): Graph {
  const g = fixtureContextGraph();
  const n = g.nodes.find((x) => x.id === "k_credible")!;
  n.provenance = "modified";
  return g;
}

// Handlers bundle for the EDIT-section tests.
function handlers() {
  return {
    onRename: vi.fn(),
    onSetConfidence: vi.fn(),
    onAddAssumption: vi.fn(),
    onFlipGroup: vi.fn(),
    onDelete: vi.fn(),
  };
}

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

describe("SelectionPanel — MODIFIED provenance (V5-3)", () => {
  it("shows the MODIFIED — UNVERIFIED third state, overriding grounding", () => {
    const { container, getByText } = render(
      <SelectionPanel graph={modifiedGraph()} selectedNodeId="k_credible" keystoneId="k_credible" />,
    );
    expect(container.querySelector('[data-evidence="modified"]')).not.toBeNull();
    // The grounded evidence no longer shows — modified takes priority.
    expect(container.querySelector('[data-evidence="grounded"]')).toBeNull();
    expect(getByText(/MODIFIED — UNVERIFIED/)).toBeTruthy();
  });
});

describe("SelectionPanel — EDIT section (V5-3)", () => {
  it("renders no EDIT controls in the pure read-only mode (no handlers)", () => {
    const { queryByTestId } = render(
      <SelectionPanel graph={graph} selectedNodeId="k_credible" keystoneId="k_credible" />,
    );
    expect(queryByTestId("rename-input")).toBeNull();
  });

  it("commits a rename on Enter", () => {
    const h = handlers();
    const { getByTestId } = render(
      <SelectionPanel graph={graph} selectedNodeId="k_credible" keystoneId="k_credible" {...h} />,
    );
    const input = getByTestId("rename-input");
    fireEvent.change(input, { target: { value: "Renamed keystone" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onRename).toHaveBeenCalledWith("k_credible", "Renamed keystone");
  });

  it("adds an assumption on a claim via the field + button", () => {
    const h = handlers();
    const { getByPlaceholderText, getByRole } = render(
      <SelectionPanel graph={graph} selectedNodeId="c_exec" keystoneId="k_credible" {...h} />,
    );
    fireEvent.change(getByPlaceholderText("New assumption…"), { target: { value: "Fresh one" } });
    fireEvent.click(getByRole("button", { name: /^add$/i }));
    expect(h.onAddAssumption).toHaveBeenCalledWith("c_exec", "Fresh one");
  });

  it("does not offer ADD ASSUMPTION on an assumption node", () => {
    const h = handlers();
    const { queryByPlaceholderText } = render(
      <SelectionPanel graph={graph} selectedNodeId="k_credible" keystoneId="k_credible" {...h} />,
    );
    expect(queryByPlaceholderText("New assumption…")).toBeNull();
  });

  it("flips a group kind via the AND↔OR toggle", () => {
    const h = handlers();
    const { getAllByTestId } = render(
      <SelectionPanel graph={graph} selectedNodeId="T" keystoneId="k_credible" {...h} />,
    );
    fireEvent.click(getAllByTestId("group-toggle")[0]);
    expect(h.onFlipGroup).toHaveBeenCalledWith("T", 0);
  });

  it("shows the DELETE button with the orphaned-dependents count", () => {
    const h = handlers();
    const { getByTestId, getByRole } = render(
      <SelectionPanel graph={graph} selectedNodeId="c_roi" keystoneId="k_credible" {...h} />,
    );
    // Deleting c_roi orphans a_bound + a_load + a_bound's sub-leaves (s_domain, s_split) → 4 dependents.
    expect(getByTestId("delete-note").textContent).toMatch(/removes 4 dependent nodes/);
    fireEvent.click(getByRole("button", { name: /delete node/i }));
    expect(h.onDelete).toHaveBeenCalledWith("c_roi");
  });

  it("hides DELETE for the thesis (root cannot be deleted)", () => {
    const h = handlers();
    const { queryByRole } = render(
      <SelectionPanel graph={graph} selectedNodeId="T" keystoneId="k_credible" {...h} />,
    );
    expect(queryByRole("button", { name: /delete node/i })).toBeNull();
  });

  it("surfaces editError as a warn chip", () => {
    const h = handlers();
    const { getByTestId } = render(
      <SelectionPanel
        graph={graph}
        selectedNodeId="k_credible"
        keystoneId="k_credible"
        editError="Delete rejected — invalid."
        {...h}
      />,
    );
    expect(getByTestId("edit-error").textContent).toMatch(/Delete rejected/);
  });
});
