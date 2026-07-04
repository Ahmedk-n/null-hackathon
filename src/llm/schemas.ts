// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import { z } from "zod";

const DepGroupSchema = z.object({
  kind: z.enum(["AND", "OR"]),
  childIds: z.array(z.string()),
});

// Confidence provenance (V3-6 · V7-4). Optional + nullable so pre-evidence graphs (the frozen
// llm/fixture.ts) still parse, and a live model can emit `evidence: null` for an ungrounded
// assumption. Strings capped so a runaway live reply can't smuggle megabytes through the wall.
// `stance` (V7-4) marks a citation supporting vs contradicting; optional/nullish so older
// single-fact replies (no stance) still parse.
const EvidenceItemSchema = z.object({
  source: z.string().max(300),
  fact: z.string().max(600),
  stance: z.enum(["supports", "contradicts"]).nullish(),
});

// V7-4 · MULTI-CITATION: evidence is now an ARRAY (1-3 findings) so multiple gathered facts
// per assumption surface. BACKWARD-COMPAT: a lone `{source,fact}` object is still accepted
// here (union) and coerced to a 1-element array by the transform below, so the frozen fixtures
// and any single-evidence live reply keep parsing. The transform also strips a `stance: null`
// down to an absent field so the output matches the engine's `NodeEvidence[]` shape exactly.
const EvidenceField = z
  .union([z.array(EvidenceItemSchema).max(3), EvidenceItemSchema])
  .nullish()
  .transform((e) => {
    if (e == null) return e;
    const arr = Array.isArray(e) ? e : [e];
    return arr.map((it) =>
      it.stance == null
        ? { source: it.source, fact: it.fact }
        : { source: it.source, fact: it.fact, stance: it.stance },
    );
  });

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["thesis", "claim", "assumption"]),
  label: z.string(),
  confidence: z.number(),
  groups: z.array(DepGroupSchema),
  evidence: EvidenceField,
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
