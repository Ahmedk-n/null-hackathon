// POST /api/gather — streams AgentEvents as text/event-stream (SSE).
// The route is the ONLY place timestamps are stamped: it passes
// `() => new Date().toISOString()` as the agents' `now`.
//
// Plan Task 11 (MCP + guardrails): a SIGNED-IN caller additionally gets their connected
// MCP servers wired into the gather call, and is rate-guarded (checkRunAllowed) BEFORE any
// paid call — over the cap, an honest "run limit reached" error event is emitted and the
// call NEVER happens (no paid spend). A run is logged (best-effort) after gather resolves.
// GUESTS (no session — including this route running outside a real Next.js request scope,
// e.g. under vitest) degrade silently to today's unchanged behavior: no rate limit, no MCP
// servers, no logging. Never throws / never 500s.
import { gather } from "@/agents";
import { checkRunAllowed, logRun } from "@/agents/runs";
import { buildMcpServers, type McpServerDef } from "@/lib/mcp/connector";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { AgentEvent, GatherKind, GatherSource } from "@/agents/types";
import type { ConnectionRow } from "@/lib/supabase/types";

export async function POST(req: Request): Promise<Response> {
  const { kind, source } = (await req.json()) as { kind: GatherKind; source: GatherSource };

  const encoder = new TextEncoder();
  const now = () => new Date().toISOString();

  // Resolve the signed-in user (if any) and their MCP servers BEFORE opening the stream, so a
  // guest caller (or any environment with no Next.js request scope) degrades cleanly.
  let userId: string | null = null;
  let mcpServers: McpServerDef[] = [];
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      try {
        const admin = createAdminSupabase();
        const { data } = await admin.from("connections").select("*").eq("user_id", user.id);
        mcpServers = buildMcpServers((data ?? []) as ConnectionRow[]);
      } catch {
        // Admin client / connections lookup unavailable — proceed with no MCP servers.
      }
    }
  } catch {
    // No session / no request scope (guest, or offline/test) — proceed as guest.
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let doneSource: "live" | "fixture" = "fixture";
      const emit = (event: AgentEvent) => {
        if (event.type === "done") doneSource = event.source;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        if (userId) {
          const allowed = await checkRunAllowed(userId);
          if (!allowed.allowed) {
            emit({
              type: "error",
              message: allowed.reason ?? "run limit reached — try again later",
              ts: now(),
            });
            return;
          }
        }

        await gather(kind, source, emit, now, mcpServers.length > 0 ? mcpServers : undefined);

        if (userId) {
          // Token accounting isn't plumbed out of the agents yet — logged as 0 rather than
          // fabricated; the run itself (kind/source/timing) is still recorded for the guard.
          await logRun(userId, kind, doneSource, 0, 0);
        }
      } catch (err) {
        // gather is designed never to throw, but stay resilient at the boundary.
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "gather failed",
          ts: now(),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
