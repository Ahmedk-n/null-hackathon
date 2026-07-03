import { z } from "zod";

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
