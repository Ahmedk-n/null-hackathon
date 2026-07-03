import type { Attack } from "@/engine";
import type { ContextWeightAdjustment, WeightCategory } from "./types";

/**
 * PURE + CLIENT-SAFE. Deterministic context-to-attack reweighting that runs
 * OUTSIDE the engine, BEFORE attacks enter it. Type-only imports; no engine
 * runtime, no Anthropic SDK, no process.env. `clamp01` is reimplemented locally
 * so this module never depends on @/engine at runtime.
 */

const K = 0.5;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

const CATEGORY_KEYWORDS: Record<WeightCategory, string[]> = {
  execution: ["execution", "delivery", "operate", "migrate", "second-order", "second order"],
  market: ["market", "demand", "customer", "adoption"],
  technical: ["technical", "architecture", "infra", "observability", "scaling"],
  competitor: ["competitor", "incumbent", "rival"],
  opportunity_cost: ["opportunity", "instead", "not doing", "focus"],
  timeline: ["timeline", "deadline", "schedule", "near-term"],
  reliability: ["reliability", "uptime", "sla", "resilience"],
  auditability: ["audit", "compliance", "traceability", "regulatory"],
};

/**
 * Map a free-form attack category to a WeightCategory by first keyword hit, or
 * null if nothing matches. Deterministic and total (iteration order fixed).
 */
export function normaliseCategory(raw: string): WeightCategory | null {
  const hay = raw.toLowerCase();
  for (const category of Object.keys(CATEGORY_KEYWORDS) as WeightCategory[]) {
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (hay.includes(keyword)) return category;
    }
  }
  return null;
}

/**
 * Deterministically nudge attack severity by matching each attack's category to
 * a ContextWeightAdjustment.
 *
 * Rules:
 * - unclassifiable category -> attack unchanged
 * - no adjustment for the matched category -> attack unchanged
 * - multiple adjustments for one category -> the highest magnitude wins
 * - severity' = clamp01(severity * (1 + sign(direction) * K * magnitude))
 * - never mutates the input (returns new Attack objects)
 */
export function reweightAttacksByContext(
  attacks: Attack[],
  adjustments: ContextWeightAdjustment[],
): Attack[] {
  return attacks.map((atk) => {
    const cat = normaliseCategory(atk.category);
    if (cat === null) return { ...atk };
    const matches = adjustments.filter((w) => w.targetCategory === cat);
    if (matches.length === 0) return { ...atk };
    const w = matches.reduce((a, b) => (b.magnitude > a.magnitude ? b : a));
    const sign = w.direction === "increase" ? 1 : -1;
    const severity = clamp01(atk.severity * (1 + sign * K * w.magnitude));
    return { ...atk, severity };
  });
}
