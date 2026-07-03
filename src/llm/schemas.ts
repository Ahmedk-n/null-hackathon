import { z } from "zod";

/*
 * SCHEMA POLICY: `confidence` and `severity` use bare `z.number()` (no
 * `.min(0).max(1)`) by design. We TOLERATE slightly out-of-range model output
 * and let the engine clamp it (`clamp01` in propagation.ts / load.ts) rather
 * than reject an otherwise-good graph/attack set and lose it to the fixture.
 * This mirrors the context layer's `postClamp` tolerance policy.
 */

const DepGroupSchema = z.object({
  kind: z.enum(["AND", "OR"]),
  childIds: z.array(z.string()),
});

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["thesis", "claim", "assumption"]),
  label: z.string(),
  confidence: z.number(),
  groups: z.array(DepGroupSchema),
});

export const GraphSchema = z.object({
  thesisId: z.string(),
  nodes: z.array(NodeSchema),
});

const AttackSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  category: z.string(),
  severity: z.number(),
  rationale: z.string(),
});

export const AttacksSchema = z.object({
  attacks: z.array(AttackSchema),
});

export const ReinforcementSchema = z.object({
  suggestion: z.string(),
});

export type GraphOutput = z.infer<typeof GraphSchema>;
export type AttacksOutput = z.infer<typeof AttacksSchema>;
export type ReinforcementOutput = z.infer<typeof ReinforcementSchema>;
