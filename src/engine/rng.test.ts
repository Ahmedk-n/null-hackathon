import { describe, it, expect } from "vitest";
import { makeRng, hashSeed, normal } from "./rng";

describe("rng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });

  it("hashSeed is stable and unsigned", () => {
    const h = hashSeed("thesis|c1:0.8|a1:0.9");
    expect(h).toBe(hashSeed("thesis|c1:0.8|a1:0.9"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });

  it("normal() is ~mean 0, ~sd 1 over many samples", () => {
    const rng = makeRng(7);
    const xs = Array.from({ length: 20000 }, () => normal(rng));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(sd - 1)).toBeLessThan(0.05);
  });
});
