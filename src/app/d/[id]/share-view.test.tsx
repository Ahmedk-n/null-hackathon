// @vitest-environment jsdom
// P2-T7 · ShareView — the read-only structure rendered on a share link. Client-only render test
// (the fetch/notFound routing lives in page.test.tsx). Reuses KeystoneCanvas + ContextUsedPanel
// directly (same shims canvas.test.tsx uses — React Flow needs ResizeObserver/matchMedia in jsdom).
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ShareView, type ShareDecision } from "./ShareView";
import { fixtureContextGraph } from "@/context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function makeDecision(overrides: Partial<ShareDecision> = {}): ShareDecision {
  return {
    id: "d-1",
    title: "Migrate to microservices",
    savedAtISO: "2026-07-04T03:30:00Z",
    mode: "A",
    input: { businessContextText: "", technicalContextText: "", temporalContextText: "", decisionText: "d" },
    companyContext: null,
    pack: null,
    graph: fixtureContextGraph(),
    verdict: { integrity: 62, keystoneId: "k_credible", failedIds: [], loadApplied: false },
    ...overrides,
  };
}

describe("ShareView (/d/[id]) — read-only share render", () => {
  it("renders the title, integrity, and keystone id straight from the fetched row", () => {
    const { getByTestId, container } = render(<ShareView decision={makeDecision()} />);
    expect(getByTestId("share-title").textContent).toBe("Migrate to microservices");
    expect(container.textContent).toMatch(/62% /);
    expect(container.textContent).toContain("k_credible");
  });

  it("mounts the read-only KeystoneCanvas with the decision's graph", () => {
    const { getByTestId } = render(<ShareView decision={makeDecision()} />);
    const canvas = getByTestId("share-canvas");
    expect(canvas.querySelector("[data-canvas-perspective], .react-flow, svg, canvas")).toBeTruthy();
  });

  it("shows 'no context pack recorded' when the snapshot has none", () => {
    const { getByText } = render(<ShareView decision={makeDecision({ pack: null })} />);
    expect(getByText(/no context pack was recorded/i)).toBeTruthy();
  });

  it("Copy link writes the current URL to the clipboard and flips the button label", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { getByText } = render(<ShareView decision={makeDecision()} />);
    fireEvent.click(getByText("Copy link"));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(getByText("Copied")).toBeTruthy());
  });
});
