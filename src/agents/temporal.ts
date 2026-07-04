// Temporal agent: one Claude call turning free-text notes/agenda into findings
// (upcoming meetings, deadlines, urgency). No external tools, so it goes DIRECTLY through the
// forced-tool-call transport (Wave B: structuredCall with `emit_findings` + GatherFindingsSchema,
// validated by zod on return) — replacing the old free-text JSON scraping (collectText +
// extractFindings). Falls back to the scripted fixture on no key / empty notes / thin reply
// (< MIN_FACTS) / any error. Never throws. Streaming emit/now shape is UNCHANGED.
import type { Emit, GatherFindings, Now, TemporalSource } from "./types";
import { GatherFindingsSchema, MIN_FACTS } from "./schemas";
import { replayFixture } from "./fixtures";
import { retryOnce } from "./retry";
import { hasApiKey, structuredCall } from "@/llm/structured";

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
    const findings: GatherFindings = await retryOnce(() =>
      structuredCall({
        system: TEMPORAL_SYSTEM,
        user: source.notes,
        schema: GatherFindingsSchema,
        toolName: "emit_findings",
        toolDescription:
          "Emit the temporal findings (upcoming events, deadlines, urgency) as one structured object.",
      }),
    );

    emit({ type: "status", message: "Extracting events, deadlines, and urgency…", ts: now() });
    // MIN_FACTS gate preserved: a thin live reply looks sparse in the ledger, so fall through to
    // the fixture (every fixture ships >= MIN_FACTS) rather than rendering it.
    if (findings.facts.length >= MIN_FACTS) {
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
