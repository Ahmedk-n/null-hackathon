// Temporal agent: one Claude call turning free-text notes/agenda into findings
// (upcoming meetings, deadlines, urgency). No external tools. Falls back to the
// scripted fixture on no key / empty notes / any error. Never throws.
import Anthropic from "@anthropic-ai/sdk";
import type { Emit, GatherFindings, Now, TemporalSource } from "./types";
import { collectText, extractFindings } from "./schemas";
import { replayFixture } from "./fixtures";
import { retryOnce } from "./retry";

const MODEL = "claude-opus-4-8";
// Hard per-request deadline so a slow live call can never freeze the demo. The SDK rejects
// with APIConnectionTimeoutError, which the existing catch → fixture fallback handles.
const REQUEST_TIMEOUT_MS = 30_000;

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const TEMPORAL_SYSTEM = `You are Keystone's temporal context agent. From the founder's pasted notes/agenda, extract the
near-term time pressure relevant to a decision: upcoming meetings/events, deadlines, and overall
urgency. Keep date descriptions verbatim from the notes (e.g. "tomorrow", "next Tuesday").

Return a single JSON object and nothing else, matching exactly:
{
  "kind": "temporal",
  "summary": "<2-4 sentences suitable to paste into a context textarea>",
  "facts": [ { "label": "...", "value": "<terse headline>", "source": "notes",
               "detail": "<1-2 sentences elaborating the event/deadline and its stakes>",
               "specifics": ["<quantified: dates verbatim, counts, named parties — e.g. 'tomorrow', 'in 2 days'>"] } ]
}
Populate "detail" and "specifics" for every fact — put QUANTIFIED data in specifics (dates verbatim
from the notes, counts, named parties), not vague prose. Produce at least 3 facts. Do not invent
dates or events that are not in the notes.`;

export async function gatherTemporal(
  source: TemporalSource,
  emit: Emit,
  now: Now,
): Promise<GatherFindings> {
  const fallback = () => replayFixture("temporal", emit, now);
  if (!hasApiKey() || !source.notes || !source.notes.trim()) return fallback();

  try {
    emit({ type: "status", message: "Parsing agenda / notes…", ts: now() });
    // maxRetries: 0 — retryOnce below owns the single guardrail retry (see business.ts).
    const client = new Anthropic({ maxRetries: 0 });
    const res = await retryOnce(() =>
      client.messages.create(
        {
          model: MODEL,
          max_tokens: 8_000,
          system: TEMPORAL_SYSTEM,
          messages: [{ role: "user", content: source.notes }],
        },
        { timeout: REQUEST_TIMEOUT_MS },
      ),
    );

    emit({ type: "status", message: "Extracting events, deadlines, and urgency…", ts: now() });
    const findings = extractFindings(collectText(res.content));
    if (findings) {
      findings.kind = "temporal";
      for (const f of findings.facts) emit({ type: "finding", finding: f, ts: now() });
      emit({ type: "done", findings, source: "live", ts: now() });
      return findings;
    }
    return fallback();
  } catch {
    return fallback();
  }
}
