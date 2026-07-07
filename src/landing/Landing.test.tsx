// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import Landing from "./Landing";

// React 19 + Testing Library act() environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

describe("Landing (/) — V5-1", () => {
  it("renders the hero, manifesto, vocabulary, and CTAs without crashing", () => {
    const { container, getAllByRole } = render(<Landing startedAt="2026-07-04T03:30:00Z" />);
    const text = container.textContent ?? "";

    // HERO headline — leads with the load-bearing / keystone value prop.
    expect(text).toMatch(/can.t survive without/i);
    // The CONTEXT → STRUCTURE → STRESS → KEYSTONE pipeline strip.
    expect(text).toContain("CONTEXT");
    expect(text).toContain("STRUCTURE");
    expect(text).toContain("STRESS");

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

    // v6 vocabulary — the five new mechanics all explained (never cut).
    expect(text).toContain("RIVAL CANDIDATES");
    expect(text).toContain("STRATEGY LENS");
    expect(text).toContain("WIND TUNNEL");
    expect(text).toContain("SHARED FOUNDATION");
    expect(text).toContain("SKYLINE");

    // HOW IT WORKS — the DESIGN → TEST → ASSEMBLE arc (v6 spec §4).
    expect(text).toContain("DESIGN");
    expect(text).toContain("TEST");
    expect(text).toContain("ASSEMBLE");

    // Studio CTAs point at /studio: the hero "OPEN STUDIO" primary, the closing "ENTER STUDIO",
    // and the "OPEN THE REAL SAMPLE" shortcut (scenario R default) all resolve there.
    const studioLinks = getAllByRole("link").filter(
      (a) => a.getAttribute("href") === "/studio",
    );
    expect(studioLinks.length).toBeGreaterThanOrEqual(1);
    expect(studioLinks.some((a) => /open studio/i.test(a.textContent ?? ""))).toBe(true);
    expect(studioLinks.some((a) => /real sample/i.test(a.textContent ?? ""))).toBe(true);

    // The secondary "SIGN IN" CTA points at /login.
    const loginLinks = getAllByRole("link").filter(
      (a) => a.getAttribute("href") === "/login",
    );
    expect(loginLinks.length).toBeGreaterThanOrEqual(1);
    expect(loginLinks.some((a) => /sign in/i.test(a.textContent ?? ""))).toBe(true);

    // VIEW SKYLINE secondary CTA points at /skyline.
    const skylineLinks = getAllByRole("link").filter(
      (a) => a.getAttribute("href") === "/skyline",
    );
    expect(skylineLinks.length).toBeGreaterThanOrEqual(1);
    expect(skylineLinks.some((a) => /view skyline/i.test(a.textContent ?? ""))).toBe(true);

    // The live mini-collapse hero mounts (initial frame — the assemble phase, tick 0).
    expect(container.querySelector('[data-testid="mini-collapse-hero"]')).not.toBeNull();

    // DECISIONS ledger empty-state seam (V5-4 wires real entries later).
    expect(text).toMatch(/no analyses yet — enter the studio/i);
  });
});
