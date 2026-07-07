import { describe, it, expect } from "vitest";
import { CONNECTION_KINDS, CONNECTION_KIND_ORDER, isConnectionKind } from "./kinds";

describe("CONNECTION_KINDS presets", () => {
  it("has a preset for every kind in CONNECTION_KIND_ORDER", () => {
    for (const kind of CONNECTION_KIND_ORDER) {
      expect(CONNECTION_KINDS[kind]).toBeDefined();
      expect(typeof CONNECTION_KINDS[kind].label).toBe("string");
      expect(typeof CONNECTION_KINDS[kind].secretLabel).toBe("string");
    }
  });

  it("github/linear/notion/jira have a fixed hosted URL", () => {
    expect(CONNECTION_KINDS.github.url).toMatch(/^https:\/\//);
    expect(CONNECTION_KINDS.linear.url).toMatch(/^https:\/\//);
    expect(CONNECTION_KINDS.notion.url).toMatch(/^https:\/\//);
    expect(CONNECTION_KINDS.jira.url).toMatch(/^https:\/\//);
  });

  it("calendar/custom have no fixed URL (user supplies one)", () => {
    expect(CONNECTION_KINDS.calendar.url).toBe("");
    expect(CONNECTION_KINDS.custom.url).toBe("");
  });
});

describe("isConnectionKind", () => {
  it("accepts every known kind", () => {
    for (const kind of CONNECTION_KIND_ORDER) {
      expect(isConnectionKind(kind)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isConnectionKind("slack")).toBe(false);
    expect(isConnectionKind(42)).toBe(false);
    expect(isConnectionKind(null)).toBe(false);
    expect(isConnectionKind(undefined)).toBe(false);
  });
});
