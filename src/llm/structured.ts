import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType, ZodTypeDef } from "zod";
import { toolsetFor, type McpServerDef } from "@/lib/mcp/connector";

/**
 * SERVER-ONLY structured-output transport (absorbed from founder-a, Wave A).
 * Imports the Anthropic SDK and reads ANTHROPIC_API_KEY from the environment —
 * must never be imported by client/store/UI code. It is the sole *sanctioned*
 * SDK importer we are ADDING; the existing server transports (src/llm/client.ts,
 * src/llm/design.ts, src/llm/reinforce.ts, src/context/compile.ts) remain
 * sanctioned too. Wave B rewires those callers onto this module; Wave A only
 * lands it (compiles + unit-tested), no callers rewired.
 *
 * @anthropic-ai/sdk@0.68 has no `messages.parse` / `zodOutputFormat`, so we get
 * structured output the version-robust way: a single FORCED tool call whose input
 * schema is the JSON Schema of the zod type, then validate the returned tool input
 * with zod. The API returns schema-shaped `tool_use.input`, killing the prose-wrap
 * / truncated-brace / markdown-fence silent-fallback failures of free-text scraping.
 */
export const MODEL = "claude-opus-4-8";
export const MAX_TOKENS = 16_000;
// Beta header for the MCP connector (mcp_servers + mcp_toolset tools). Confirmed against
// @anthropic-ai/sdk@0.68.0 in P3 (src/app/api/connections/[id]/test/route.ts): `mcp_servers`
// and this beta string ARE typed on `client.beta.messages.create`; only the `mcp_toolset`
// tool variant is missing from `BetaToolUnion`, hence the one localized cast below.
const MCP_BETA = "mcp-client-2025-11-20";
// Hard per-request deadline, consistent with src/llm/client.ts. The SDK rejects with
// APIConnectionTimeoutError past this; callers own the retry + fixture fallback.
const REQUEST_TIMEOUT_MS = 45_000;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface StructuredCallArgs<T> {
  system: string;
  user: string;
  // Input generic left OPEN (`unknown`) so schemas with `.transform()` / `.default()` (e.g. the
  // GraphSchema evidence coercion) infer T as the schema's OUTPUT type — what `.parse` returns —
  // rather than collapsing to the pre-transform input shape.
  schema: ZodType<T, ZodTypeDef, unknown>;
  toolName: string;
  toolDescription: string;
  // Optional per-call request deadline (ms). Defaults to REQUEST_TIMEOUT_MS. A caller whose emit
  // must synthesize MANY rich facts from a large research transcript (e.g. the business agent) can
  // raise this; the default keeps the fast callers (temporal) tight.
  timeoutMs?: number;
  // Optional MCP connector servers (plan Task 11) — the signed-in caller's connected tools
  // (GitHub/Linear/Notion/...). When present (non-empty) AND a key exists, the call goes
  // through `client.beta.messages.create` with `mcp_servers` + one `mcp_toolset` tool per
  // server + the MCP beta header. Absent (undefined/empty) -> the existing non-beta path,
  // byte-for-byte unchanged.
  mcpServers?: McpServerDef[];
}

/**
 * Make one structured call and return schema-validated T.
 * Throws on any failure (network, no tool_use block, schema mismatch); callers
 * are responsible for retry + fixture fallback so they never throw themselves.
 */
export async function structuredCall<T>(args: StructuredCallArgs<T>): Promise<T> {
  // maxRetries: 0 — callers own the single guardrail retry; the SDK's default auto-retry
  // would otherwise stack multiple timeouts and blow the per-request deadline.
  const client = new Anthropic({ maxRetries: 0 }); // reads process.env.ANTHROPIC_API_KEY
  // Inline all sub-schemas ($refStrategy: none) so the tool schema is self-contained.
  const jsonSchema = zodToJsonSchema(args.schema, { $refStrategy: "none" });

  const tool: Anthropic.Tool = {
    name: args.toolName,
    description: args.toolDescription,
    // The SDK's InputSchema type is stricter than the generic JSON Schema shape
    // zod-to-json-schema emits; the object is a valid JSON Schema at runtime.
    input_schema: jsonSchema as unknown as Anthropic.Tool.InputSchema,
  };

  if (args.mcpServers && args.mcpServers.length > 0) {
    // MCP branch (plan Task 11) — same forced single-tool call, but over the beta endpoint
    // with the caller's connected MCP servers attached. `mcp_servers` is typed natively
    // (BetaRequestMCPServerURLDefinition matches McpServerDef field-for-field); the
    // `mcp_toolset` tool variant is the one cast this SDK version needs.
    const res = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: args.system,
        betas: [MCP_BETA],
        mcp_servers: args.mcpServers,
        tools: [
          tool as unknown as Anthropic.Beta.BetaToolUnion,
          ...(toolsetFor(args.mcpServers).map(
            (t) => t as unknown as Anthropic.Beta.BetaToolUnion,
          )),
        ],
        tool_choice: { type: "tool", name: args.toolName },
        messages: [{ role: "user", content: args.user }],
      },
      { timeout: args.timeoutMs ?? REQUEST_TIMEOUT_MS },
    );

    const block = res.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (!block) throw new Error("no tool_use block in Claude response");
    return args.schema.parse(block.input);
  }

  const res = await client.messages.create(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: args.system,
      tools: [tool],
      tool_choice: { type: "tool", name: args.toolName },
      messages: [{ role: "user", content: args.user }],
    },
    { timeout: args.timeoutMs ?? REQUEST_TIMEOUT_MS },
  );

  const block = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!block) throw new Error("no tool_use block in Claude response");
  return args.schema.parse(block.input);
}

/**
 * Run `fn`, retry once on failure, and if it still fails, return `fallback()`.
 * Guarantees the returned promise never rejects (demo-safe). Kept from founder-a
 * for callers that prefer an inline retry+fallback over @/agents/retry::retryOnce.
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
