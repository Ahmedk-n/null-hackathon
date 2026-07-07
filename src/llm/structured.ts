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

export interface ExploreWithToolsArgs {
  system: string;
  user: string;
  // The connected MCP servers to explore with. Must be non-empty (callers only invoke this
  // when they actually have a connection); an empty array would produce a request with no
  // tools at all, so callers gate on `mcpServers.length > 0` before calling this.
  mcpServers: McpServerDef[];
  // Bounded loop size — see the doc comment below for why more than one turn is ever needed.
  maxSteps?: number;
  timeoutMs?: number;
}

const EXPLORE_MAX_STEPS = 5;
// Exploration turns can run long (multiple MCP round-trips); give this its own, more generous
// deadline than the fast forced-emit default. Same rejection contract as REQUEST_TIMEOUT_MS —
// the SDK throws past this, and the caller's retryOnce + fixture fallback handles it.
const EXPLORE_REQUEST_TIMEOUT_MS = 90_000;

/**
 * Research helper (P4.5): a genuine multi-turn exploration call — deliberately WITHOUT a forced
 * `tool_choice` — so the model can actually call the connected MCP tools (`mcp_toolset`) across
 * turns before answering. This is the gap `structuredCall`'s mcpServers branch can't close: its
 * `tool_choice` is ALWAYS pinned to the emit tool, which forces the model to answer immediately
 * and makes any other tool (including `mcp_toolset`) uncallable in that same request. Mirrors
 * src/agents/business.ts's research-then-emit shape (PHASE 1 unforced research, PHASE 2 forced
 * emit via structuredCall), generalized from Anthropic server tools to the MCP connector.
 *
 * The Anthropic MCP connector normally resolves `mcp_toolset` calls SERVER-SIDE within one
 * `messages.create` turn (like `web_search`/`web_fetch`) and returns already-resolved
 * `mcp_tool_use`/`mcp_tool_result` blocks alongside the final text — so most explorations
 * finish in a single call. For a long-running investigation the API can return
 * `stop_reason: "pause_turn"` ("we paused a long-running turn... provide the response back
 * as-is in a subsequent request to let the model continue"); this loop honors that up to
 * `maxSteps` turns, then returns whatever was accumulated so far (never hangs, never throws
 * itself — the SDK error still propagates so the caller's retry/fallback fires).
 *
 * Returns the accumulated text: real `text` blocks verbatim, plus a compact trace of any
 * `mcp_tool_use` / `mcp_tool_result` blocks (tool name, server, truncated input/result) so
 * phase 2 has visibility into what was actually explored even if the model never wrote a full
 * prose summary of it.
 */
export async function exploreWithTools(args: ExploreWithToolsArgs): Promise<string> {
  // maxRetries: 0 — the caller owns the single guardrail retry (retryOnce), consistent with
  // structuredCall above.
  const client = new Anthropic({ maxRetries: 0 });
  const maxSteps = Math.max(1, args.maxSteps ?? EXPLORE_MAX_STEPS);
  // The one localized cast this seam needs: `mcp_toolset` is missing from this SDK version's
  // `BetaToolUnion` (see the file-header note above) even though the beta API accepts it.
  const tools = toolsetFor(args.mcpServers).map((t) => t as unknown as Anthropic.Beta.BetaToolUnion);

  let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: args.user }];
  const chunks: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const res = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: args.system,
        betas: [MCP_BETA],
        mcp_servers: args.mcpServers,
        tools,
        messages,
        // Deliberately NO tool_choice — "auto" is the default, which is what lets the model
        // choose to call mcp_toolset tools instead of being pinned to a single forced tool.
      },
      { timeout: args.timeoutMs ?? EXPLORE_REQUEST_TIMEOUT_MS },
    );

    chunks.push(renderExploreContent(res.content));

    if (res.stop_reason !== "pause_turn" || step === maxSteps - 1) break;

    // "pause_turn": replay the response back as-is (no new user turn) so the model can continue
    // its own long-running turn. Response content blocks (BetaContentBlock) aren't nominally the
    // request block union (BetaContentBlockParam) even though every block this loop can see
    // (text / mcp_tool_use / mcp_tool_result) round-trips structurally intact — one localized
    // cast at this boundary, same pattern as the mcp_toolset cast above.
    messages = [
      ...messages,
      { role: "assistant", content: res.content as unknown as Anthropic.Beta.BetaContentBlockParam[] },
    ];
  }

  return chunks.join("\n\n").trim();
}

/** Render one turn's content blocks as readable text for phase 2: `text` blocks verbatim, plus a
 *  compact trace of `mcp_tool_use` / `mcp_tool_result` blocks (tool + server + truncated
 *  input/result) so the finalizer sees what was actually explored even absent a prose summary. */
function renderExploreContent(content: Anthropic.Beta.BetaContentBlock[]): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "mcp_tool_use") {
      parts.push(
        `[called MCP tool "${block.name}" on server "${block.server_name}" with input ${JSON.stringify(block.input).slice(0, 500)}]`,
      );
    } else if (block.type === "mcp_tool_result") {
      const resultText =
        typeof block.content === "string" ? block.content : block.content.map((c) => c.text).join("\n");
      parts.push(`[MCP tool result${block.is_error ? " (error)" : ""}: ${resultText.slice(0, 1_500)}]`);
    }
  }
  return parts.join("\n");
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
