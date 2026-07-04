// POST /api/tunnel — streams the adversarial wind-tunnel duel as text/event-stream (SSE).
// Mirrors /api/gather: this route is the ONLY place timestamps are stamped — it passes
// `() => new Date().toISOString()` as the duel's `now`. Body: {graph, pack?, scenario?}.
import { runTunnel } from "@/agents/tunnel";
import type { TunnelEvent } from "@/context/tunnel";
import { isScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";
import type { Graph } from "@/engine";

export async function POST(req: Request): Promise<Response> {
  const { graph, pack, scenario } = (await req.json()) as {
    graph: Graph;
    pack?: DecisionContextPack;
    scenario?: unknown;
  };

  const encoder = new TextEncoder();
  const now = () => new Date().toISOString();
  const scenarioArg = isScenarioId(scenario) ? scenario : undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: TunnelEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await runTunnel(graph, pack, emit, now, 5, scenarioArg);
      } catch (err) {
        // runTunnel is designed never to throw, but stay resilient at the boundary.
        emit({ type: "error", message: err instanceof Error ? err.message : "tunnel failed", ts: now() });
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
