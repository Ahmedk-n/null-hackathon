// Zod mirrors of the agent contracts (validated at the boundary), plus small
// parsing helpers shared by the agents. Classic zod (v3 API) — mirrors the
// convention in src/context/schemas.ts.
import { z } from "zod";
import type { AgentEvent, GatherFindings } from "./types";

export const GatherKindSchema = z.enum(["technical", "business", "temporal"]);

export const GatherFindingSchema = z.object({
  label: z.string(),
  value: z.string(),
  source: z.string(),
});

export const GatherFindingsSchema = z.object({
  kind: GatherKindSchema,
  summary: z.string(),
  facts: z.array(GatherFindingSchema),
  raw: z.record(z.unknown()).optional(),
});

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), message: z.string(), ts: z.string() }),
  z.object({ type: z.literal("finding"), finding: GatherFindingSchema, ts: z.string() }),
  z.object({ type: z.literal("error"), message: z.string(), ts: z.string() }),
  z.object({
    type: z.literal("done"),
    findings: GatherFindingsSchema,
    source: z.enum(["live", "fixture"]),
    ts: z.string(),
  }),
]);

// Inferred-type alignment: the zod-inferred shapes must match the hand-written
// TS interfaces in types.ts. These are pure type-level assertions (no runtime).
export type GatherFindingsOut = z.infer<typeof GatherFindingsSchema>;
export type AgentEventOut = z.infer<typeof AgentEventSchema>;

type Assignable<A, B> = A extends B ? true : false;
type _findingsFwd = Assignable<GatherFindingsOut, GatherFindings> extends true ? true : never;
type _findingsBwd = Assignable<GatherFindings, GatherFindingsOut> extends true ? true : never;
type _eventFwd = Assignable<AgentEventOut, AgentEvent> extends true ? true : never;
type _eventBwd = Assignable<AgentEvent, AgentEventOut> extends true ? true : never;
// If any alignment breaks, one of these becomes `never` and errors on use below.
export const __alignment: [_findingsFwd, _findingsBwd, _eventFwd, _eventBwd] = [
  true,
  true,
  true,
  true,
];

/** Collect the concatenated text of all `text` content blocks in a message. */
export function collectText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      out.push((block as { text: string }).text);
    }
  }
  return out.join("\n");
}

/** Minimum source-attributed facts a live parse must carry to be worth rendering.
 *  Below this the ledger looks sparse (T11), so we reject → the caller retries or
 *  falls back to a fixture (every fixture ships ≥ MIN_FACTS). */
export const MIN_FACTS = 5;

/**
 * Extract the first balanced JSON object from a free-text model reply and validate
 * it against GatherFindingsSchema. Returns null on any failure (never throws) — and
 * also rejects (returns null) a parse with fewer than MIN_FACTS facts, so a thin live
 * reply falls through to the retry/fixture path rather than rendering a sparse ledger.
 */
export function extractFindings(text: string): GatherFindings | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    const res = GatherFindingsSchema.safeParse(parsed);
    if (!res.success) return null;
    if (res.data.facts.length < MIN_FACTS) return null;
    return res.data;
  } catch {
    return null;
  }
}
