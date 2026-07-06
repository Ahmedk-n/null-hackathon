// @vitest-environment jsdom
// V6-1 · MiniStructure — the reusable renderer extracted from the landing hero. Verifies the
// auto-layout is deterministic + well-formed and that the renderer surfaces the visual language
// (nodes by id, keystone tag, failed state, crack self-draw, integrity readout).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MiniStructure, layoutStructure } from "./MiniStructure";
import { fixtureContextGraphR } from "@/context/fixtures";
import { keystone } from "@/engine";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

describe("layoutStructure (deterministic auto-layout)", () => {
  it("places every node and every intra-graph edge", () => {
    const graph = fixtureContextGraphR();
    const { nodes, edges } = layoutStructure(graph, { keystoneId: keystone(graph)!.id });
    expect(nodes.length).toBe(graph.nodes.length);
    // edges = one per (parent → child) group member
    const edgeCount = graph.nodes.reduce(
      (acc, n) => acc + n.groups.reduce((a, g) => a + g.childIds.length, 0),
      0,
    );
    expect(edges.length).toBe(edgeCount);
  });

  it("tags the keystone node and lays out bottom-up (assumptions appear before the thesis)", () => {
    const graph = fixtureContextGraphR();
    const keyId = keystone(graph)!.id;
    const { nodes } = layoutStructure(graph, { keystoneId: keyId });
    const key = nodes.find((n) => n.id === keyId)!;
    expect(key.tag).toBe("KEYSTONE");
    const thesis = nodes.find((n) => n.role === "thesis")!;
    const anyAssumption = nodes.find((n) => n.role === "assumption")!;
    expect(anyAssumption.appear).toBeLessThan(thesis.appear);
  });

  it("is pure — identical input yields identical output", () => {
    const a = layoutStructure(fixtureContextGraphR(), { keystoneId: "team_has_backend_capacity" });
    const b = layoutStructure(fixtureContextGraphR(), { keystoneId: "team_has_backend_capacity" });
    expect(a).toEqual(b);
  });
});

describe("MiniStructure (renderer)", () => {
  const graph = fixtureContextGraphR();
  const keyId = keystone(graph)!.id;
  const layout = layoutStructure(graph, { keystoneId: keyId });

  it("renders a node box per graph node once the tick passes their appear", () => {
    const { container } = render(
      <MiniStructure
        {...layout}
        keystoneId={keyId}
        tick={999}
        readout={{ gaugeInt: 53, status: "HOLDING", statusColor: "#3c7a3a", phase: "STANDING" }}
      />,
    );
    expect(container.querySelectorAll("[data-node]").length).toBe(graph.nodes.length);
    expect(container.querySelector(`[data-node="${keyId}"]`)).not.toBeNull();
  });

  it("shows the integrity readout numeral", () => {
    const { container } = render(
      <MiniStructure
        {...layout}
        keystoneId={keyId}
        tick={999}
        readout={{ gaugeInt: 8, status: "FAILED", statusColor: "#b23a2e", phase: "✗ COLLAPSED" }}
      />,
    );
    expect(container.textContent).toMatch(/8%/);
    expect(container.textContent).toMatch(/COLLAPSED/);
  });

  it("marks failed nodes FAILED when passed a failedIds set", () => {
    const { container } = render(
      <MiniStructure
        {...layout}
        keystoneId={keyId}
        tick={999}
        failedIds={new Set([keyId])}
        cracked
        readout={null}
      />,
    );
    const keyBox = container.querySelector(`[data-node="${keyId}"]`)!;
    // Auto-laid (thumbnail) nodes render compact — the failed state is carried on the
    // node's data attribute (and its red styling) rather than a clipped "FAILED" word.
    expect(keyBox.getAttribute("data-failed")).toBe("true");
  });
});
