import { describe, it, expect } from "vitest";
import { pickLayoutMode, layoutPositions } from "./layout";
import { fixtureContextGraph } from "@/context";

describe("pickLayoutMode", () => {
  it("selects the mode by node count", () => {
    expect(pickLayoutMode(5)).toBe("simple-2d");
    expect(pickLayoutMode(8)).toBe("simple-2d");
    expect(pickLayoutMode(9)).toBe("layered-2-5d");
    expect(pickLayoutMode(25)).toBe("layered-2-5d");
    expect(pickLayoutMode(26)).toBe("clustered-zoom");
  });
});

describe("layoutPositions", () => {
  it("assigns a position to every node", () => {
    const pos = layoutPositions(fixtureContextGraph());
    for (const node of fixtureContextGraph().nodes) {
      expect(pos.has(node.id)).toBe(true);
    }
  });

  it("places the thesis above its assumptions (smaller y)", () => {
    const pos = layoutPositions(fixtureContextGraph());
    expect(pos.get("T")!.y).toBeLessThan(pos.get("k_credible")!.y);
  });
});
