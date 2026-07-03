import { describe, it, expect } from "vitest";
import { constraintPlanes, planeStrikes } from "./constraints";
import { fixtureDecisionContextPack } from "./fixtures";
import type { DecisionContextPack } from "./types";
import type { Attack } from "@/engine";

describe("constraintPlanes (V4-2 · ideas have constraints)", () => {
  it("returns [] for a null pack", () => {
    expect(constraintPlanes(null)).toEqual([]);
  });

  it("returns [] for a pack with no relevant constraints", () => {
    const pack = { relevantConstraints: [] } as unknown as DecisionContextPack;
    expect(constraintPlanes(pack)).toEqual([]);
  });

  it("derives ≥1 plane from the hero A pack, one per relevant constraint", () => {
    const planes = constraintPlanes(fixtureDecisionContextPack());
    expect(planes.length).toBe(2);
    expect(planes.map((p) => p.id)).toEqual(["con_time", "con_reg"]);
  });

  it("derives terse UPPERCASE labels from kind + text", () => {
    const [time, reg] = constraintPlanes(fixtureDecisionContextPack());
    // "Credible plan needed by tomorrow." → TIME token + capped terse clause.
    expect(time.label).toBe("TIME · CREDIBLE PLAN NEEDED…");
    expect(reg.label).toBe("REG · REGULATED FINTECH BUY…");
    for (const p of constraintPlanes(fixtureDecisionContextPack())) {
      expect(p.label).toBe(p.label.toUpperCase());
    }
  });

  it("maps each plane to the attack categories that strike it (kind + statement keywords)", () => {
    const [time, reg] = constraintPlanes(fixtureDecisionContextPack());
    // time kind → [timeline, execution]; statement adds nothing classifiable.
    expect(time.categories).toEqual(["timeline", "execution"]);
    // regulatory kind → [auditability, reliability]; statement "audit trails" is already
    // auditability (deduped — no duplicate appended).
    expect(reg.categories).toEqual(["auditability", "reliability"]);
  });
});

describe("planeStrikes (V4-2 · collisions)", () => {
  const planes = constraintPlanes(fixtureDecisionContextPack());

  it("no attacks → every plane un-struck", () => {
    const strikes = planeStrikes(planes, []);
    expect(strikes.every((s) => !s.struck && s.tally === 0)).toBe(true);
  });

  it("strikes the plane whose categories a matching attack normalises into", () => {
    const attacks: Attack[] = [
      { id: "a1", targetId: "k_credible", category: "execution risk", severity: 0.6, rationale: "" },
      { id: "a2", targetId: "a_bound", category: "second-order", severity: 0.2, rationale: "" },
      { id: "a3", targetId: "a_audit", category: "auditability", severity: 0.1, rationale: "" },
    ];
    const strikes = planeStrikes(planes, attacks);
    const time = strikes.find((s) => s.planeId === "con_time")!;
    const reg = strikes.find((s) => s.planeId === "con_reg")!;
    // execution + second-order(→execution) both hit the TIME plane.
    expect(time.struck).toBe(true);
    expect(time.tally).toBe(2);
    expect(time.targetIds).toEqual(["k_credible", "a_bound"]);
    // auditability hits the REG plane.
    expect(reg.struck).toBe(true);
    expect(reg.tally).toBe(1);
  });

  it("an unclassifiable attack category strikes nothing", () => {
    const attacks: Attack[] = [
      { id: "a1", targetId: "n1", category: "zzz-unknown", severity: 0.9, rationale: "" },
    ];
    expect(planeStrikes(planes, attacks).every((s) => !s.struck)).toBe(true);
  });
});
