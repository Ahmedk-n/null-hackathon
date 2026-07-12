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
  /** Whole seconds elapsed since the current run started (0 when idle). Ticks once a second while
   *  `running` so the UI can show a live heartbeat during the business agent's long, silent
   *  web-search gap — reads as alive, not hung. Counter-based (setInterval), no timestamp math. */
  elapsedSec: number;
  run: (kind: GatherKind, source: GatherSource) => Promise<void>;
}

// Hard client-side deadline so `running` can never spin forever if the server hangs.
// Uses setTimeout (no Date.now / timestamp math — GOAL T8).
//
// The BUSINESS agent runs live web-search/fetch tools whose latency is unbounded: measured at
// ~116s end-to-end against a real company, and up to ~275s in the wild. The old 75s ceiling
// aborted every live business run mid-"Searching the web…", so the log stalled and never
// produced findings. 300s comfortably covers the observed + worst-case business latency while
// still capping a genuinely hung server. Technical/temporal finish in seconds and are unaffected.
export const RUN_DEADLINE_MS = 300_000;
// Constant placeholder ts for client-generated terminal events (never a live clock).
const CLIENT_TS = "";

export function useAgentStream(): UseAgentStream {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [findings, setFindings] = useState<GatherFindings | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const run = useCallback(async (kind: GatherKind, source: GatherSource) => {
    setEvents([]);
    setFindings(null);
    setRunning(true);
    // Heartbeat: reset to 0 and tick once a second for the life of the run. setInterval + a
    // functional increment — no Date.now/timestamp math (GOAL T8). Cleared in `finally`.
    setElapsedSec(0);
    const heartbeat = setInterval(() => setElapsedSec((s) => s + 1), 1000);
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
      clearInterval(heartbeat);
      setRunning(false);
    }
  }, []);

  return { events, findings, running, elapsedSec, run };
}
