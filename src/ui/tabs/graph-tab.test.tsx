// @vitest-environment jsdom
// V9-2 · GraphTab VIEW control offers a 3D render mode (react-three-fiber). T9 removed SECTION,
// so the toggle is now two segments — 2D / 3D. jsdom can't run WebGL, so we do NOT mount the
// real three canvas: the lazy Keystone3D module is stubbed, and we assert (a) the toggle offers
// 2D / 3D and (b) selecting 3D lazy-swaps the board without throwing (the flat react-flow board
// unmounts). The heavy three.js integration is covered by the build + e2e gates, not jsdom.
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
  it("offers 2D / 3D in the VIEW control (SECTION removed in T9)", () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    render(<GraphTab />);

    const toggle = screen.getByTestId("depth-view-toggle");
    const labels = [...toggle.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).toEqual(["2D", "3D"]);
    expect(screen.getByTestId("view-3d")).toBeTruthy();
  });

  it("selecting 3D lazy-swaps the board (flat react-flow unmounts) without throwing", async () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    const { container } = render(<GraphTab />);

    // The flat 2D board renders react-flow by default.
    expect(container.querySelector(".react-flow")).not.toBeNull();

    // Switch to 3D — must not throw; the lazy Keystone3D stub mounts and the flat board goes.
    fireEvent.click(screen.getByTestId("view-3d"));
    expect(await screen.findByTestId("keystone-3d-stub")).toBeTruthy();
    await waitFor(() => expect(container.querySelector(".react-flow")).toBeNull());

    // The 3D segment reads as active; DETAIL disables while 3D is showing.
    expect(screen.getByTestId("view-3d").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("detail-toggle").hasAttribute("disabled")).toBe(true);
  });

  it("returning to 2D restores the flat board", async () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    const { container } = render(<GraphTab />);

    fireEvent.click(screen.getByTestId("view-3d"));
    await screen.findByTestId("keystone-3d-stub");

    // Back to 2D — the react-flow board returns, the stub goes.
    const flatBtn = [...screen.getByTestId("depth-view-toggle").querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "2D",
    )!;
    fireEvent.click(flatBtn);
    await waitFor(() => expect(container.querySelector(".react-flow")).not.toBeNull());
    expect(screen.queryByTestId("keystone-3d-stub")).toBeNull();
  });
});
