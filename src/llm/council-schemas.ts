// Contextual analysis council — structured-output schema for the SALC-style weighting agent
// (Phase 3, Task 2). Mirrors the zod idiom in src/llm/schemas.ts: a plain object schema fed
// straight to `zodToJsonSchema` for the forced `emit_weighting` tool call.
import { z } from "zod";

const NodeWeightingSchema = z.object({
  nodeId: z.string(),
  contextWeight: z.number(),
  rationale: z.string(),
  evidenceRefs: z.array(z.string()),
});

export const WeightingSchema = z.object({
  nodeWeights: z.array(NodeWeightingSchema),
  contextKeystoneId: z.string().nullable(),
});

export type WeightingOutput = z.infer<typeof WeightingSchema>;

// Skeptic debate agent (Phase 3, Task 4): the 1–3 unstated assumptions the situation hides,
// each grounded in a finding, plus a one-sentence fracture narrative.
const HiddenAssumptionSchema = z.object({
  label: z.string(),
  why: z.string(),
  evidenceRefs: z.array(z.string()),
});

export const SkepticSchema = z.object({
  hiddenAssumptions: z.array(HiddenAssumptionSchema),
  fractureNarrative: z.string(),
});

export type SkepticOutput = z.infer<typeof SkepticSchema>;

// Remediation agent (Phase 4): one concrete cheap falsifying test per surviving finding.
const RemediationSchema = z.object({
  findingId: z.string(),
  kind: z.enum(["spine", "hidden"]),
  action: z.string(),
  evidenceRefs: z.array(z.string()),
});

export const RemediateSchema = z.object({
  remediations: z.array(RemediationSchema),
});

export type RemediateOutput = z.infer<typeof RemediateSchema>;
