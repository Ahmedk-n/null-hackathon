// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
// Pure, deterministic, engine-adjacent. No import from @/engine (one-directional boundary).
import type { Attack } from "@/engine";
import type { ContextWeightAdjustment, WeightCategory } from "./types";

/** Local re-implementation to keep the context→engine boundary one-directional. */
export function clamp01(n: number): number {
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

const CATEGORY_ORDER: WeightCategory[] = [
  "execution",
  "market",
  "technical",
  "competitor",
  "opportunity_cost",
  "timeline",
  "reliability",
  "auditability",
];

/**
 * Deterministic, total, pure. Lower-cases raw, returns the first WeightCategory whose
 * keyword list matches a substring; null if none.
 */
export function normaliseCategory(raw: string): WeightCategory | null {
  const lower = raw.toLowerCase();
  for (const category of CATEGORY_ORDER) {
    if (CATEGORY_KEYWORDS[category].some((kw) => lower.includes(kw))) return category;
  }
  return null;
}

const K = 0.5; // tuning constant

/**
 * Deterministically nudge attack severity by category match.
 * unclassifiable category → unchanged; no matching adjustment → unchanged;
 * multiple adjustments for one category → highest magnitude wins; clamped 0..1; input never mutated.
 */
export function reweightAttacksByContext(
  attacks: Attack[],
  adjustments: ContextWeightAdjustment[],
): Attack[] {
  return attacks.map((atk) => {
    const cat = normaliseCategory(atk.category);
    if (cat === null) return atk; // unclassifiable → unchanged
    const matches = adjustments.filter((w) => w.targetCategory === cat);
    if (matches.length === 0) return atk; // no adjustment for this category → unchanged
    const w = matches.reduce((a, b) => (b.magnitude > a.magnitude ? b : a)); // strongest magnitude wins
    const sign = w.direction === "increase" ? 1 : -1;
    const severity = clamp01(atk.severity * (1 + sign * K * w.magnitude));
    return { ...atk, severity }; // returns a NEW attack; never mutates
  });
}
