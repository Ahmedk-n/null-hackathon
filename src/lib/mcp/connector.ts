// ConnectionRow[] -> Anthropic MCP connector defs (plan Task 10). Pure, server-only
// (no SDK import, no secrets logged) — the ONLY thing this module does is reshape
// already-loaded rows into the shape `client.beta.messages.create` expects
// (`mcp_servers` + the `mcp_toolset` tool per server). Unit-tested exhaustively
// since it is pure. Consumed by src/app/api/gather/route.ts (builds the list from
// the signed-in user's connections) and threaded into src/llm/structured.ts /
// src/agents/{technical,business,temporal}.ts.
//
// `McpServerDef` mirrors @anthropic-ai/sdk@0.68.0's `Anthropic.Beta.BetaRequestMCPServerURLDefinition`
// field-for-field (name/type/url/authorization_token) so it can be passed straight through as
// `mcp_servers` with no cast; only the `mcp_toolset` TOOL variant needs a cast (missing from
// BetaToolUnion in this SDK version — see src/llm/structured.ts).
import type { ConnectionRow } from "@/lib/supabase/types";

export interface McpServerDef {
  type: "url";
  name: string;
  url: string;
  authorization_token?: string;
}

export interface McpToolsetTool {
  type: "mcp_toolset";
  mcp_server_name: string;
}

/** A slug the Anthropic `mcp_servers[].name` / `mcp_toolset.mcp_server_name` fields can
 *  carry — lowercase, hyphenated, non-empty (mirrors the slugify in the P3 test route). */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "server";
}

/**
 * Build the `mcp_servers` array for a user's connections. Drops rows with an empty/blank
 * `url` (nothing to connect to). Maps `secret` -> `authorization_token`, OMITTING the field
 * entirely when the secret is null/blank (rather than sending `undefined` through, which the
 * SDK would still serialize) — matches the plan's "omit if null" requirement. Names are
 * slugified and de-duplicated so two connections with colliding slugs (e.g. two "GitHub"
 * connections) don't produce two `mcp_servers` entries with the same `name`.
 */
export function buildMcpServers(rows: ConnectionRow[]): McpServerDef[] {
  const defs: McpServerDef[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;

    const base = slugify(row.name);
    let name = base;
    let n = 2;
    while (seen.has(name)) {
      name = `${base}-${n++}`;
    }
    seen.add(name);

    const def: McpServerDef = { type: "url", name, url };
    const secret = row.secret?.trim();
    if (secret) def.authorization_token = secret;
    defs.push(def);
  }

  return defs;
}

/** One `mcp_toolset` tool per server def, naming it via `mcp_server_name`. */
export function toolsetFor(defs: McpServerDef[]): McpToolsetTool[] {
  return defs.map((d) => ({ type: "mcp_toolset", mcp_server_name: d.name }));
}
