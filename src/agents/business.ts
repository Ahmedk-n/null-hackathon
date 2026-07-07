// Business agent: one Claude call using Anthropic server tools (web_search + web_fetch)
// over the website + competitors, shaped into GatherFindings with url provenance.
// Falls back to the scripted fixture on no key / no source / any error. Never throws.
import Anthropic from "@anthropic-ai/sdk";
import type { BusinessSource, Emit, GatherFindings, Now } from "./types";
import { collectText, GatherFindingsSchema, MIN_FACTS } from "./schemas";
import { replayFixture } from "./fixtures";
import { retryOnce } from "./retry";
import { structuredCall } from "@/llm/structured";
import { toolsetFor, type McpServerDef } from "@/lib/mcp/connector";

const MODEL = "claude-opus-4-8";
// Beta header for the MCP connector — see src/llm/structured.ts for the confirmed-SDK-fact note.
const MCP_BETA = "mcp-client-2025-11-20";
// PHASE-1 (web research) hard per-request deadline. The SDK rejects with APIConnectionTimeoutError
// past this, which the catch → fixture fallback handles. This call does genuine multi-step
// server-side tool use (web_search + web_fetch).
//
// V8-C5-fix · raised 60s→135s. The original 60s (with a 5-search/3-fetch budget) was the direct
// cause of the two-phase live regression: phase-1 never finished in 60s, timed out twice via
// retryOnce, and every live business gather silently fell back to fixture. Under current
// server-tool latency (measured 2026-07-04) even a MINIMAL 1-search/1-fetch turn takes ~108s, so
// 135s gives one honest turn ~25s of headroom. NOTE: this makes a live business gather slow
// (~110s phase-1 + ~55s phase-2 ≈ 165s end-to-end); that is acceptable for the LIVE flex path
// (the rehearsed demo runs on fixtures), and any genuine overrun still falls back to the fixture.
const REQUEST_TIMEOUT_MS = 135_000;

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Anthropic server tools. Audit R2 flagged that if these type ids were rejected by the live
// API, messages.create would throw and business gather would SILENTLY always fall back to the
// fixture — the "live" flex quietly dead. Verified live against claude-opus-4-8 on 2026-07-04
// (scripts/probe-server-tools.mjs): the newer dynamic-filtering _20260209 variants ARE accepted
// (no 400) — but they run code_execution under the hood and their latency is wildly unbounded
// (~53s to >275s per turn, timing out even at 90s), which would keep the live path dead by
// timeout. The basic _20250305 / _20250910 variants do the same real web research WITHOUT the
// code-execution filtering, at a reliable ~30-38s — so the live flex actually works. max_uses
// bounds the tool loop (3 searches + 2 fetches over the site + one competitor is ample for the
// 5+ facts the system prompt asks for).
//
// web_search_20250305 is in the SDK's non-beta ToolUnion, but web_fetch_20250910 lives only in
// the beta namespace, so the single boundary cast below is still required (task R2: kept only
// because it's still needed, and now verified safe). This code only runs with a key present.
// V7-4 · deepened the tool budget (search 3→5, fetch 2→3) so the agent researches the site AND
// several competitors instead of just one — more sources → richer, quantified findings. The basic
// _20250305 / _20250910 variants run at ~30-38s for a full turn; each extra tool call adds only a
// few seconds, and the 60s REQUEST_TIMEOUT_MS + retryOnce still bound one attempt. Kept modest (5/3,
// not 8/6) so a live gather doesn't routinely overrun 60s; on timeout the catch → fixture fallback
// protects the demo. Trade-off: more competitor coverage vs. a slightly higher tail latency.
// V8-C5-fix · trimmed 5/3 → 1/1. V7-4's 5-search/3-fetch deepening (plus current server-tool
// latency) pushed a research turn far past the request timeout, so phase-1 never finished and the
// live path silently fell back to fixture. Even 1 search + 1 fetch takes ~108s under current
// latency, yet still yields plenty (a live probe produced 13 rich facts incl. the named
// competitor) because web_search returns many results the model synthesizes and phase-2 enriches.
// Kept at the floor to keep phase-1 inside the 135s ceiling; raise cautiously if latency improves.
const SERVER_TOOLS = [
  { type: "web_search_20250305", name: "web_search", max_uses: 1 },
  { type: "web_fetch_20250910", name: "web_fetch", max_uses: 1 },
];

// PHASE 1 — web research. Server tools (web_search + web_fetch) loop MULTI-STEP server-side within
// this one create call (search → fetch → search again). It does NOT emit the schema here (a forced
// tool_choice cannot coexist with server tools); it ends with a detailed synthesis carrying URLs,
// verbatim quotes, and numbers, which PHASE 2 (a forced-tool emit_findings) converts into the schema.
const BUSINESS_SYSTEM = `You are Keystone's business context agent. Using web search and web fetch, research the
company's website AND the named competitors deeply — do multiple searches and fetch several real
pages (the company's about/pricing/security/customers pages, and each competitor's site). Build the
business context a founder would paste into a decision tool: company stage/funding, industry, customer
segments, revenue model, competitors (as named entities), strategic goals, growth bottlenecks, and
market constraints (e.g. auditability / reliability / uptime / certification demands).

When you have genuinely researched, STOP calling tools and write a THOROUGH business synthesis in
prose. For every claim include the EXACT URL you fetched it from and a SHORT VERBATIM quote from that
page, plus any numbers (funding $, pricing, headcount, dates, growth %, uptime/SLA, cert names). Name
the competitors explicitly. Do not fabricate — only state what you actually read.`;

// PHASE 2 — forced-tool finalizer. Converts the research synthesis into the rich typed schema.
const BUSINESS_EMIT_SYSTEM = `You are Keystone's business context agent. Below is the transcript of your web research
(searches, fetched pages, and your synthesis). Convert it into structured findings by calling the
emit_findings tool. Use ONLY facts grounded in the transcript — never fabricate a URL, number, or
competitor.

For EACH fact populate the rich fields:
  - "label": short tag (e.g. "Industry", "Stage / funding", "Growth bottleneck", "Competitor").
  - "value": a terse headline.
  - "source": the EXACT, FULL url you fetched the fact from (not just a domain) — never a blank
    string or a generic label. If you cannot attribute a fact to a specific URL you actually
    fetched, drop the fact rather than emit an unsourced one.
  - "category": one of market | funding | growth | competitor | constraint | segment.
  - "sourceExcerpt": a SHORT VERBATIM quote from that page — real text you read.
  - "quantities": numbers as {metric,value,unit?} — e.g. {metric:"Series B",value:"45",unit:"$M"},
    {metric:"uptime SLA",value:"99.95",unit:"%"}, {metric:"founded",value:"2014"}.
  - "entities": named competitors / investors / certs (e.g. "Ledgerline", "SOC 2 Type II").
  - "dateISO": ONLY when the page states an absolute date (e.g. a funding announcement); else omit.
  - "implication": one sentence on why this matters for the founder's decision.
  - "confidence": 0..1.

Produce at least 7 facts (more if the transcript supports it) across the site AND every named
competitor — not all from one page, kind "business". Prefer facts that carry a real sourceExcerpt
and quantities.`;

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
  mcpServers?: McpServerDef[],
): Promise<GatherFindings> {
  const fallback = () => replayFixture("business", emit, now);
  const hasSource = Boolean(source.website) || Boolean(source.competitors?.length);
  if (!hasApiKey() || !hasSource) return fallback();

  try {
    // PHASE 1 — web research (+ the founder's connected MCP tools, e.g. Notion/Linear, when
    // present). The server tools AND MCP toolset both loop multi-step server-side within this
    // one call. maxRetries: 0 — retryOnce below owns the single guardrail retry; the SDK's
    // default auto-retry would otherwise stack multiple 30s timeouts and blow the client deadline.
    emit({ type: "status", message: "Searching the web for the company…", ts: now() });
    const client = new Anthropic({ maxRetries: 0 });
    const hasMcp = Boolean(mcpServers && mcpServers.length > 0);
    // Both branches return the same shape we actually use (`.content`); typed as `unknown`
    // here (fed straight to collectText, which already accepts `unknown`) so the two Anthropic
    // response types (Message vs. beta BetaMessage) don't need reconciling into one signature.
    let content: unknown;
    if (hasMcp) {
      const res = await retryOnce(() =>
        client.beta.messages.create(
          {
            model: MODEL,
            max_tokens: 16_000,
            system: BUSINESS_SYSTEM,
            messages: [{ role: "user", content: renderUser(source) }],
            betas: [MCP_BETA],
            mcp_servers: mcpServers,
            tools: [
              ...SERVER_TOOLS,
              ...toolsetFor(mcpServers as McpServerDef[]),
            ] as unknown as Anthropic.Beta.BetaToolUnion[],
          },
          { timeout: REQUEST_TIMEOUT_MS },
        ),
      );
      content = res.content;
    } else {
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
      content = res.content;
    }

    // PHASE 2 — forced-tool finalizer. The research synthesis (with URLs + verbatim quotes + numbers)
    // is fed to a single FORCED emit_findings call that lands the rich typed schema reliably. Separate
    // request because a forced tool_choice cannot coexist with server tools.
    // V8-C5-fix · timeoutMs raised to 90s (structuredCall's 45s default was the SECOND cause of the
    // regression once phase-1 was trimmed): synthesizing 5-13 rich facts from the ~15k-char research
    // transcript measured ~55-58s live, overrunning 45s and falling back. Both phases are guarded by
    // retryOnce + the try/catch → fixture fallback, so any overrun falls back and never hangs.
    emit({ type: "status", message: "Analyzing website and competitors (forced emit)…", ts: now() });
    const synthesis = collectText(content);
    const findings: GatherFindings = await retryOnce(() =>
      structuredCall({
        system: BUSINESS_EMIT_SYSTEM,
        user: `SOURCE:\n${renderUser(source)}\n\nRESEARCH TRANSCRIPT:\n\n${synthesis}`,
        schema: GatherFindingsSchema,
        toolName: "emit_findings",
        toolDescription:
          "Emit the business findings (rich typed, with verbatim quotes, quantities, entities, implication) as one structured object.",
        timeoutMs: 90_000,
        mcpServers,
      }),
    );

    // MIN_FACTS gate preserved: a thin reply looks sparse, so fall through to the fixture.
    if (findings.facts.length >= MIN_FACTS) {
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
