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

// PROBABILISTIC · assumption-only evidence-strength signal (Task 4). Optional + nullish so
// pre-probabilistic live replies / the frozen fixtures (which never emit this field) still parse.
// A `null` reply is coerced to `undefined` (omit) — the solver already defaults missing to
// "moderate" (see engine/types.ts GraphNode.evidenceStrength), so there is nothing to repair here.
const EvidenceStrengthField = z
  .enum(["weak", "moderate", "strong"])
  .nullish()
  .transform((v) => v ?? undefined);

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["thesis", "claim", "assumption"]),
  label: z.string(),
  confidence: z.number(),
  groups: z.array(DepGroupSchema),
  evidence: EvidenceField,
  evidenceStrength: EvidenceStrengthField,
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

// PROBABILISTIC · `emit_drivers` (Task 4). A driver is a latent common-mode factor with a
// per-assumption `loading` in [0,1]; loadings are clamped and drivers are capped/filtered by the
// caller (client.ts::repairDrivers) AFTER this schema-shape check, mirroring the
// validate.ts repair-vs-reject split for graphs/attacks.
const DriverLoadingSchema = z.object({
  assumptionId: z.string(),
  loading: z.number(),
});

const DriverSchema = z.object({
  id: z.string(),
  label: z.string(),
  loadings: z.array(DriverLoadingSchema),
});

export const DriversSchema = z.object({
  drivers: z.array(DriverSchema),
});

export type GraphOutput = z.infer<typeof GraphSchema>;
export type AttacksOutput = z.infer<typeof AttacksSchema>;
export type DriversOutput = z.infer<typeof DriversSchema>;
