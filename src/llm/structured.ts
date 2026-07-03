import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";

/**
 * SERVER-ONLY. Imports the Anthropic SDK and reads ANTHROPIC_API_KEY from the
 * environment — must never be imported by client/store/UI code. Only
 * src/llm/client.ts, src/llm/reinforce.ts, and src/context/compile.ts import it.
 *
 * SDK 0.68 has no `messages.parse` / `zodOutputFormat`, so we get structured
 * output the version-robust way: a single forced tool call whose input schema
 * is the JSON Schema of the zod type, then validate the returned input with zod.
 */
export const MODEL = "claude-opus-4-8";
export const MAX_TOKENS = 16000;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface StructuredCallArgs<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  toolName: string;
  toolDescription: string;
}

/**
 * Make one structured call and return schema-validated T.
 * Throws on any failure (network, no tool_use block, schema mismatch); callers
 * are responsible for retry + fixture fallback so they never throw themselves.
 */
export async function structuredCall<T>(args: StructuredCallArgs<T>): Promise<T> {
  const client = new Anthropic(); // reads process.env.ANTHROPIC_API_KEY
  // Inline all sub-schemas ($refStrategy: none) so the tool schema is self-contained.
  const jsonSchema = zodToJsonSchema(args.schema, { $refStrategy: "none" });

  const tool: Anthropic.Tool = {
    name: args.toolName,
    description: args.toolDescription,
    // The SDK's InputSchema type is stricter than the generic JSON Schema shape
    // zod-to-json-schema emits; the object is a valid JSON Schema at runtime.
    input_schema: jsonSchema as unknown as Anthropic.Tool.InputSchema,
  };

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: args.system,
    tools: [tool],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: args.user }],
  });

  const block = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!block) throw new Error("no tool_use block in Claude response");
  return args.schema.parse(block.input);
}

/**
 * Run `fn`, retry once on failure, and if it still fails, return `fallback()`.
 * Guarantees the returned promise never rejects (demo-safe).
 */
export async function withRetryFallback<T>(
  fn: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  try {
    return await fn();
  } catch {
    try {
      return await fn();
    } catch {
      return fallback();
    }
  }
}
