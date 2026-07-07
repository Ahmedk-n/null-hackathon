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
import type { McpServerDef } from "@/lib/mcp/connector";

const TEMPORAL_SYSTEM = `You are Keystone's temporal context agent. From the founder's pasted notes/agenda, extract the
near-term time pressure relevant to a decision: upcoming meetings/events, deadlines, and overall
urgency. Keep date descriptions verbatim from the notes (e.g. "tomorrow", "next Tuesday").

Call the emit_findings tool with a structured object. For EACH fact populate the rich fields:
  - "label": short tag ("Upcoming meeting", "Deadline", "Urgency", "Follow-up", "Stakeholder commitment").
  - "value": a terse headline.
  - "source": always "notes" — the notes are the only source, but this field must still be present
    and non-empty on every fact.
  - "category": one of meeting | deadline | urgency | commitment (coarse bucket).
  - "sourceExcerpt": a SHORT VERBATIM quote from the notes that this fact rests on — never
    paraphrase; quote the actual words that ground the fact.
  - "quantities": extracted numbers as {metric,value,unit?} — especially LEAD TIME
    ({metric:"lead time", value:"1", unit:"day"} for "tomorrow", "2" days for "in 2 days"),
    and an urgency estimate 0..1 as {metric:"urgency", value:"0.85"} on the urgency fact.
  - "entities": named people/orgs/parties mentioned (e.g. the customer, the team).
  - "dateISO": ONLY if the notes state an absolute calendar date; otherwise omit it — never
    invent one from relative words like "tomorrow".
  - "implication": one sentence on why this pressures THE DECISION (what it raises the weight on).
  - "confidence": 0..1.

Produce at least 6 facts (an urgency fact, plus meetings/deadlines/follow-ups/commitments — pull
every distinct one out of the notes rather than merging them). Order by lead time (soonest first).
Do not invent dates or events that are not in the notes.`;

export async function gatherTemporal(
  source: TemporalSource,
  emit: Emit,
  now: Now,
  mcpServers?: McpServerDef[],
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
        mcpServers,
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
