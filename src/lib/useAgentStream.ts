"use client";
// Thin client hook over POST /api/gather. fetch-only: it imports TYPES from the agent
// types module (erased at build) and reaches the agents solely over HTTP. It never
// imports an agent server module or the Anthropic SDK, so the key never enters the bundle.
import { useCallback, useState } from "react";
import type { AgentEvent, GatherFindings, GatherKind, GatherSource } from "@/agents/types";

export interface UseAgentStream {
  events: AgentEvent[];
  findings: GatherFindings | null;
  running: boolean;
  run: (kind: GatherKind, source: GatherSource) => Promise<void>;
}

// Hard client-side deadline so `running` can never spin forever if the server hangs.
// Uses setTimeout (no Date.now / timestamp math — GOAL T8).
const RUN_DEADLINE_MS = 75_000;
// Constant placeholder ts for client-generated terminal events (never a live clock).
const CLIENT_TS = "";

export function useAgentStream(): UseAgentStream {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [findings, setFindings] = useState<GatherFindings | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async (kind: GatherKind, source: GatherSource) => {
    setEvents([]);
    setFindings(null);
    setRunning(true);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), RUN_DEADLINE_MS);
    try {
      const res = await fetch("/api/gather", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, source }),
        signal: controller.signal,
      });
      const body = res.body;
      if (!body) return;

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as AgentEvent;
            setEvents((prev) => [...prev, event]);
            if (event.type === "done") setFindings(event.findings);
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch (err) {
      // On the deadline abort (or a network failure) surface a terminal error event,
      // consistent with how the AGENT LOG renders server-emitted `error` events.
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const message = aborted
        ? `Agent run exceeded the ${RUN_DEADLINE_MS / 1000}s deadline and was cancelled.`
        : "Agent run failed.";
      setEvents((prev) => [...prev, { type: "error", message, ts: CLIENT_TS }]);
    } finally {
      clearTimeout(deadline);
      setRunning(false);
    }
  }, []);

  return { events, findings, running, run };
}
