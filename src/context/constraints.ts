// Pure, deterministic, engine-adjacent. "Ideas have constraints" made literal: the
// pack's relevant constraints become named boundary PLANES the structure sits inside,
// and an attack whose category maps to a plane's categories is a visible COLLISION.
// No React, no wall-clock, no randomness — the geometry is a pure function of the pack
// (and, for strikes, the attacks). Testable and safe to bundle anywhere.
import type { Attack } from "@/engine";
import type { ConstraintType, DecisionContextPack, WeightCategory } from "./types";
// Same classifier vocabulary the reweighter uses — a plane is struck by exactly the
// attack categories that map into its category set. Deep import (no barrel) mirrors the
// one-directional context boundary the rest of this folder respects.
import { normaliseCategory } from "./weights";

/**
 * A constraint rendered as a CAD boundary plane. `label` is a terse uppercase datum
 * (`TIME · CREDIBLE PLAN NEEDED B…`); `categories` are the WeightCategory values an
 * attack must normalise into to STRIKE this plane.
 */
export interface ConstraintPlane {
  id: string;
  label: string;
  categories: WeightCategory[];
}

/**
 * A plane's collision state under a set of attacks. `tally` counts the striking
 * attacks; `struck` is tally>0; `targetIds` are the distinct attacked nodes (in
 * first-seen order) the strike-lines point at.
 */
export interface PlaneStrike {
  planeId: string;
  struck: boolean;
  tally: number;
  targetIds: string[];
}

// Leading CAD-datum token per constraint kind — short, uppercase, derived from `type`.
const TYPE_TOKEN: Record<ConstraintType, string> = {
  time: "TIME",
  budget: "BUDGET",
  team: "TEAM",
  technical: "TECH",
  market: "MARKET",
  regulatory: "REG",
};

// Which attack categories (weights.ts vocabulary) collide with each constraint kind.
// A time constraint is struck by timeline/execution pressure; a regulatory one by
// auditability/reliability failures; etc. Kept in the WeightCategory vocabulary so the
// canvas can match a normalised attack category directly against a plane.
const TYPE_CATEGORIES: Record<ConstraintType, WeightCategory[]> = {
  time: ["timeline", "execution"],
  budget: ["opportunity_cost", "execution"],
  team: ["execution"],
  technical: ["technical", "reliability"],
  market: ["market", "competitor"],
  regulatory: ["auditability", "reliability"],
};

const MAX_LABEL = 22;

/** Terse uppercase clause from a constraint statement — collapsed, unpunctuated, capped. */
function terse(statement: string): string {
  const cleaned = statement
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .toUpperCase();
  return cleaned.length > MAX_LABEL
    ? cleaned.slice(0, MAX_LABEL - 1).trimEnd() + "…"
    : cleaned;
}

/**
 * The constraint planes for a pack — one per relevant constraint, deterministic and
 * order-preserving. `null`/empty pack → []. The label reads from BOTH the constraint's
 * kind (leading token) and its text (terse clause); the categories combine the kind's
 * collision set with any category the statement itself normalises into (deduped, kind
 * categories first).
 */
export function constraintPlanes(pack: DecisionContextPack | null): ConstraintPlane[] {
  if (!pack || pack.relevantConstraints.length === 0) return [];
  return pack.relevantConstraints.map((c) => {
    const cats = [...TYPE_CATEGORIES[c.type]];
    const fromText = normaliseCategory(c.statement);
    if (fromText !== null && !cats.includes(fromText)) cats.push(fromText);
    return {
      id: c.id,
      label: `${TYPE_TOKEN[c.type]} · ${terse(c.statement)}`,
      categories: cats,
    };
  });
}

/**
 * Collision derivation — for each plane, the attacks whose category normalises into the
 * plane's category set. Pure and total: unclassifiable attack categories never strike;
 * `targetIds` is distinct + first-seen ordered. Empty planes/attacks → per-plane
 * un-struck rows (or [] when there are no planes).
 */
export function planeStrikes(
  planes: readonly ConstraintPlane[],
  attacks: readonly Attack[],
): PlaneStrike[] {
  return planes.map((plane) => {
    const targetIds: string[] = [];
    let tally = 0;
    for (const atk of attacks) {
      const cat = normaliseCategory(atk.category);
      if (cat === null || !plane.categories.includes(cat)) continue;
      tally += 1;
      if (!targetIds.includes(atk.targetId)) targetIds.push(atk.targetId);
    }
    return { planeId: plane.id, struck: tally > 0, tally, targetIds };
  });
}
