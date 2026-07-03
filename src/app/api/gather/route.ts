// POST /api/gather — streams AgentEvents as text/event-stream (SSE).
// The route is the ONLY place timestamps are stamped: it passes
// `() => new Date().toISOString()` as the agents' `now`.
import { gather } from "@/agents";
import type { AgentEvent, GatherKind, GatherSource } from "@/agents/types";

export async function POST(req: Request): Promise<Response> {
  const { kind, source } = (await req.json()) as { kind: GatherKind; source: GatherSource };

  const encoder = new TextEncoder();
  const now = () => new Date().toISOString();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await gather(kind, source, emit, now);
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
