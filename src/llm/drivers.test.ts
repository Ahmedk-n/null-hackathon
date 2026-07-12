import { describe, it, expect } from "vitest";
import { generateDrivers } from "./client";
import { fixtureContextGraph } from "@/context/fixtures";

describe("generateDrivers (no-key fixture path)", () => {
  it("returns an array without throwing when no API key is present", async () => {
    // fixtureContextGraph is a FUNCTION (): Graph — must be invoked.
    const drivers = await generateDrivers(fixtureContextGraph()); // no key arg → hasApiKey() false in test
    expect(Array.isArray(drivers)).toBe(true);
    drivers.forEach((d) => {
      expect(typeof d.id).toBe("string");
      d.loadings.forEach((l) => {
        expect(l.loading).toBeGreaterThanOrEqual(0);
        expect(l.loading).toBeLessThanOrEqual(1);
      });
    });
  });
});
