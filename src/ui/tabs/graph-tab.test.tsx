// @vitest-environment jsdom
// V9-2 · GraphTab VIEW control now offers a third render mode — 3D (react-three-fiber).
// jsdom can't run WebGL, so we do NOT mount the real three canvas: the lazy Keystone3D module
// is stubbed, and we assert (a) the 3D segment exists alongside PLAN/SECTION and (b) selecting
// 3D lazy-swaps the board without throwing (the 2.5D react-flow board unmounts). The heavy
// three.js integration is covered by the build + e2e gates, not jsdom.
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

// Stub the lazy 3D leg so the test never pulls three.js / WebGL into jsdom. next/dynamic's
// internal import() of this module resolves to the stub.
vi.mock("@/canvas/Keystone3D", () => ({
  default: () => <div data-testid="keystone-3d-stub">3D STUB</div>,
}));

import { GraphTab } from "./GraphTab";
import { keystoneStore } from "@/store/useKeystone";
import { fixtureContextGraph } from "@/context";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React Flow (the 2.5D board GraphTab renders by default) needs ResizeObserver + matchMedia,
// neither of which jsdom implements. Minimal shims so the tab mounts without throwing.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(cleanup);

describe("GraphTab VIEW control — V9-2 3D leg", () => {
  it("offers PLAN / SECTION / 3D in the VIEW control", () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    render(<GraphTab />);

    const toggle = screen.getByTestId("depth-view-toggle");
    const labels = [...toggle.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Plan", "Section", "3D"]);
    expect(screen.getByTestId("view-3d")).toBeTruthy();
  });

  it("selecting 3D lazy-swaps the board (2.5D react-flow unmounts) without throwing", async () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    const { container } = render(<GraphTab />);

    // The 2.5D board renders react-flow by default.
    expect(container.querySelector(".react-flow")).not.toBeNull();

    // Switch to 3D — must not throw; the lazy Keystone3D stub mounts and the 2.5D board goes.
    fireEvent.click(screen.getByTestId("view-3d"));
    expect(await screen.findByTestId("keystone-3d-stub")).toBeTruthy();
    await waitFor(() => expect(container.querySelector(".react-flow")).toBeNull());

    // The 3D segment reads as active; DETAIL disables while 3D is showing.
    expect(screen.getByTestId("view-3d").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("detail-toggle").hasAttribute("disabled")).toBe(true);
  });

  it("returning to PLAN restores the 2.5D board", async () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    const { container } = render(<GraphTab />);

    fireEvent.click(screen.getByTestId("view-3d"));
    await screen.findByTestId("keystone-3d-stub");

    // Back to PLAN — the react-flow board returns, the stub goes.
    const planBtn = [...screen.getByTestId("depth-view-toggle").querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Plan",
    )!;
    fireEvent.click(planBtn);
    await waitFor(() => expect(container.querySelector(".react-flow")).not.toBeNull());
    expect(screen.queryByTestId("keystone-3d-stub")).toBeNull();
  });
});
