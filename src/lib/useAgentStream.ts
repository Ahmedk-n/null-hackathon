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

export function useAgentStream(): UseAgentStream {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [findings, setFindings] = useState<GatherFindings | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async (kind: GatherKind, source: GatherSource) => {
    setEvents([]);
    setFindings(null);
    setRunning(true);
    try {
      const res = await fetch("/api/gather", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, source }),
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
    } finally {
      setRunning(false);
    }
  }, []);

  return { events, findings, running, run };
}
