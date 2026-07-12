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
