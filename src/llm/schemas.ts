// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import { z } from "zod";

const DepGroupSchema = z.object({
  kind: z.enum(["AND", "OR"]),
  childIds: z.array(z.string()),
});

// Confidence provenance (V3-6). Optional + nullable so pre-evidence graphs (the frozen
// llm/fixture.ts) still parse, and a live model can emit `evidence: null` for an ungrounded
// assumption. Strings capped so a runaway live reply can't smuggle megabytes through the wall.
const EvidenceSchema = z.object({
  source: z.string().max(300),
  fact: z.string().max(600),
});

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["thesis", "claim", "assumption"]),
  label: z.string(),
  confidence: z.number(),
  groups: z.array(DepGroupSchema),
  evidence: EvidenceSchema.nullish(),
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

export type GraphOutput = z.infer<typeof GraphSchema>;
export type AttacksOutput = z.infer<typeof AttacksSchema>;
