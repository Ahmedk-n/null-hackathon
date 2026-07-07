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

    // Manifesto band — the four heart lines build to the payoff question. The weaker
    // "Can we design thoughts…" opener is intentionally dropped.
    expect(text).not.toMatch(/Can we design thoughts the way engineers design machines\?/);
    expect(text).toMatch(/Ideas have constraints\./);
    expect(text).toMatch(/Beliefs have dependencies\./);
    expect(text).toMatch(/Plans have load-bearing assumptions\./);
    expect(text).toMatch(/Taste has geometry\./);
    expect(text).toMatch(/What would a CAD tool for thinking look like\?/);

    // "How to read a structure" — the plain-English legend of the six essentials
    // (the internal 12-term jargon dump is intentionally gone).
    expect(text).toMatch(/how to read a structure/i);
    expect(text).toContain("THESIS");
    expect(text).toContain("CLAIM");
    expect(text).toContain("ASSUMPTION");
    expect(text).toContain("KEYSTONE");
    expect(text).toContain("INTEGRITY");
    expect(text).toContain("LOAD");
    // Jargon that belongs in-app, not on the landing legend.
    expect(text).not.toContain("CONSTRAINT PLANE");
    expect(text).not.toContain("EVIDENCE PLATE");
    expect(text).not.toContain("SHARED FOUNDATION");

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
