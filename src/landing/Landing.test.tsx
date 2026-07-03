// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import Landing from "./Landing";

// React 19 + Testing Library act() environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

describe("Landing (/) — V5-1", () => {
  it("renders the manifesto, vocabulary, CTA, and the hero without crashing", () => {
    const { container, getAllByRole } = render(<Landing startedAt="2026-07-04T03:30:00Z" />);
    const text = container.textContent ?? "";

    // Manifesto lines (verbatim from the track quote).
    expect(text).toMatch(/Can we design thoughts the way engineers design machines\?/);
    expect(text).toMatch(/Beliefs have dependencies\./);
    expect(text).toMatch(/Plans have load-bearing assumptions\./);
    expect(text).toMatch(/Taste has geometry\./);

    // Vocabulary terms (from the domain model).
    expect(text).toContain("KEYSTONE");
    expect(text).toContain("INTEGRITY");
    expect(text).toContain("CONSTRAINT PLANE");
    expect(text).toContain("DE-RISKING");

    // ENTER STUDIO CTA points at /studio.
    const studioLinks = getAllByRole("link").filter(
      (a) => a.getAttribute("href") === "/studio",
    );
    expect(studioLinks.length).toBeGreaterThanOrEqual(1);
    expect(studioLinks.some((a) => /enter studio/i.test(a.textContent ?? ""))).toBe(true);
    // The secondary "OPEN THE REAL SAMPLE" CTA also goes to the studio (scenario R default).
    expect(studioLinks.some((a) => /real sample/i.test(a.textContent ?? ""))).toBe(true);

    // The live mini-collapse hero mounts (initial frame — the assemble phase, tick 0).
    expect(container.querySelector('[data-testid="mini-collapse-hero"]')).not.toBeNull();

    // DECISIONS ledger empty-state seam (V5-4 wires real entries later).
    expect(text).toMatch(/no analyses yet — enter the studio/i);
  });
});
