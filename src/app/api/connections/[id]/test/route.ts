// POST /api/connections/[id]/test — MINIMAL, offline-safe connection test (P3).
// Full MCP connector wiring into the agents is a later phase (P4); this route only
// proves the server can reach the one MCP endpoint and updates `status`.
//
// Flow: authed server client confirms the caller owns the row (RLS) and reads its
// non-secret shape; the ADMIN client is the only reader of `secret` (authenticated's
// SELECT on that column is revoked in 0001_init.sql — see src/lib/supabase/admin.ts).
// With no ANTHROPIC_API_KEY -> status "untested" (honest, no call attempted). With a
// key -> one guarded Anthropic beta MCP tools-list call for this single server; ok on
// success, error + a short message otherwise. NEVER throws — always returns json, and
// always persists the resulting status on the row.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type Anthropic from "@anthropic-ai/sdk";

const MCP_BETA = "mcp-client-2025-11-20";
const MODEL = "claude-opus-4-8";

// A slug Anthropic's mcp_servers/mcp_toolset `name` field can carry — lowercase,
// hyphenated, non-empty.
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "server";
}

type ConnectionStatus = "untested" | "ok" | "error";

function jsonResult(status: ConnectionStatus, message?: string): Response {
  return NextResponse.json(message ? { status, message } : { status });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Confirm ownership (RLS-scoped) and read the non-secret shape needed to build
    // the MCP connector def.
    const { data: row, error: rowError } = await supabase
      .from("connections")
      .select("id, name, url")
      .eq("id", id)
      .single();
    if (rowError || !row) {
      return jsonResult("error", "connection not found");
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      await supabase.from("connections").update({ status: "untested" }).eq("id", id);
      return jsonResult("untested");
    }

    // Only the admin client can read `secret` — authenticated/anon SELECT on that
    // column is revoked (supabase/migrations/0001_init.sql).
    let secret: string | null = null;
    try {
      const admin = createAdminSupabase();
      const { data: secretRow } = await admin
        .from("connections")
        .select("secret")
        .eq("id", id)
        .single();
      secret = (secretRow as { secret?: string | null } | null)?.secret ?? null;
    } catch {
      // Admin client unavailable (e.g. SUPABASE_SECRET_KEY unset) — test without a token.
    }

    const serverName = slugify(row.name as string);

    try {
      const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
      const client = new AnthropicSDK({ maxRetries: 0 });

      // @anthropic-ai/sdk@0.68.0 types `mcp_servers` (BetaRequestMCPServerURLDefinition)
      // but its BetaToolUnion does not include the `mcp_toolset` tool variant yet — one
      // localized cast on that array element, nothing else needs it.
      await client.beta.messages.create({
        model: MODEL,
        max_tokens: 64,
        betas: [MCP_BETA],
        mcp_servers: [
          {
            type: "url",
            name: serverName,
            url: row.url as string,
            authorization_token: secret ?? undefined,
          },
        ],
        tools: [
          {
            type: "mcp_toolset",
            mcp_server_name: serverName,
          } as unknown as Anthropic.Beta.BetaToolUnion,
        ],
        messages: [{ role: "user", content: "List the tools available to you. Be brief." }],
      });

      await supabase.from("connections").update({ status: "ok" }).eq("id", id);
      return jsonResult("ok");
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 200) : "mcp connector test failed";
      await supabase.from("connections").update({ status: "error" }).eq("id", id);
      return jsonResult("error", message);
    }
  } catch (err) {
    // Last-resort guard — this route must never throw or 500.
    return jsonResult("error", err instanceof Error ? err.message : "connection test failed");
  }
}
