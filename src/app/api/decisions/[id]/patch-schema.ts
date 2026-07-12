// P2-T2 · request-body validation for PATCH /api/decisions/[id]. Closes a pre-existing security
// gap: the route used to read `{ verdict?: unknown; isPublic?: unknown }` and write `verdict`
// straight into the `verdict jsonb` column with NO shape check — any JSON blob could overwrite it.
// This schema pins `verdict` to the LibraryVerdict shape (src/lib/library/types.ts) and adds the
// Phase-2 outcome-resolution fields (`outcome`, `materializedCategories`). `.refine` rejects an
// empty `{}` (nothing to update), matching the route's pre-existing 400 behavior.
import { z } from "zod";

const VerdictSchema = z.object({
  integrity: z.number(),
  keystoneId: z.string().nullable(),
  failedIds: z.array(z.string()),
  loadApplied: z.boolean(),
});

export const PatchBody = z
  .object({
    verdict: VerdictSchema.optional(),
    isPublic: z.boolean().optional(),
    outcome: z.enum(["held", "failed"]).optional(),
    materializedCategories: z.array(z.string()).optional(),
  })
  .refine(
    (body) =>
      body.verdict !== undefined ||
      body.isPublic !== undefined ||
      body.outcome !== undefined ||
      body.materializedCategories !== undefined,
    { message: "nothing to update" },
  );

export type PatchBodyT = z.infer<typeof PatchBody>;
