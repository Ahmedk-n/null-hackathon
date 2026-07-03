// Business agent: one Claude call using Anthropic server tools (web_search + web_fetch)
// over the website + competitors, shaped into GatherFindings with url provenance.
// Falls back to the scripted fixture on no key / no source / any error. Never throws.
import Anthropic from "@anthropic-ai/sdk";
import type { BusinessSource, Emit, GatherFindings, Now } from "./types";
import { collectText, extractFindings } from "./schemas";
import { replayFixture } from "./fixtures";
import { retryOnce } from "./retry";

const MODEL = "claude-opus-4-8";
// Hard per-request deadline so a slow live web_search can never freeze the demo. The SDK
// rejects with APIConnectionTimeoutError, which the existing catch → fixture fallback handles.
const REQUEST_TIMEOUT_MS = 30_000;

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Anthropic server tools. The runtime API supports the _20260209 (dynamic-filtering)
// variants on claude-opus-4-8; the installed SDK's static tool union is older, so the
// value is cast at the single boundary below. This code only runs with a key present.
const SERVER_TOOLS = [
  { type: "web_search_20260209", name: "web_search" },
  { type: "web_fetch_20260209", name: "web_fetch" },
];

const BUSINESS_SYSTEM = `You are Keystone's business context agent. Using web search and web fetch, research the
company's website and the named competitors, then produce the business context a founder would
paste into a decision tool: company stage, industry, customer segments, revenue model, competitors,
strategic goals, growth bottlenecks, and market constraints (e.g. auditability / reliability demands).

After researching, STOP and return a single JSON object and nothing else, matching exactly:
{
  "kind": "business",
  "summary": "<3-5 sentences suitable to paste into a context textarea>",
  "facts": [ { "label": "...", "value": "...", "source": "<the url you found it on>" } ]
}
Every fact's "source" MUST be a url you actually fetched. Produce at least 5 facts. Do not fabricate.`;

function renderUser(source: BusinessSource): string {
  const parts: string[] = [];
  if (source.website) parts.push(`WEBSITE: ${source.website}`);
  if (source.competitors?.length) parts.push(`COMPETITORS: ${source.competitors.join(", ")}`);
  if (source.notes) parts.push(`NOTES: ${source.notes}`);
  return parts.join("\n");
}

export async function gatherBusiness(
  source: BusinessSource,
  emit: Emit,
  now: Now,
): Promise<GatherFindings> {
  const fallback = () => replayFixture("business", emit, now);
  const hasSource = Boolean(source.website) || Boolean(source.competitors?.length);
  if (!hasApiKey() || !hasSource) return fallback();

  try {
    emit({ type: "status", message: "Searching the web for the company…", ts: now() });
    // maxRetries: 0 — retryOnce below owns the single guardrail retry; the SDK's default
    // auto-retry would otherwise stack multiple 30s timeouts and blow the client deadline.
    const client = new Anthropic({ maxRetries: 0 });
    const res = await retryOnce(() =>
      client.messages.create(
        {
          model: MODEL,
          max_tokens: 16_000,
          system: BUSINESS_SYSTEM,
          messages: [{ role: "user", content: renderUser(source) }],
          tools: SERVER_TOOLS as unknown as Anthropic.Messages.ToolUnion[],
        },
        { timeout: REQUEST_TIMEOUT_MS },
      ),
    );

    emit({ type: "status", message: "Analyzing website and competitors…", ts: now() });
    const findings = extractFindings(collectText(res.content));
    if (findings) {
      findings.kind = "business";
      for (const f of findings.facts) emit({ type: "finding", finding: f, ts: now() });
      emit({ type: "done", findings, source: "live", ts: now() });
      return findings;
    }
    return fallback();
  } catch {
    return fallback();
  }
}
