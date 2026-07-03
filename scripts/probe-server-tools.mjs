// Probe: does the live Anthropic API accept the _20260209 server-tool type ids
// (web_search / web_fetch, dynamic-filtering variants) on claude-opus-4-8?
//
// The installed SDK (0.68.0) statically types only web_search_20250305 /
// web_fetch_20250910, so src/agents/business.ts casts the _20260209 ids through
// ToolUnion[]. Audit R2 flagged that if the live API rejects those ids,
// messages.create throws and business gather silently always falls back to the
// fixture — the demo's "live" flex would be quietly dead. This script asks the
// real API directly and reports the exact verdict.
//
// Usage (key is in .env.local, NOT the shell env — load it first):
//   export $(grep -v '^#' .env.local | xargs) && node scripts/probe-server-tools.mjs
//
// It runs one minimal web_search_20260209 request with a trivial query and a
// small max_tokens, and prints whether the tool ran (tool_use / result block)
// or the API rejected the tool type (400 invalid tool type + message).

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

async function probe(toolType, toolName) {
  const client = new Anthropic({ maxRetries: 0 });
  try {
    const res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "In one word, search the web for the capital of France.",
          },
        ],
        tools: [{ type: toolType, name: toolName }],
      },
      { timeout: 60_000 },
    );
    const types = res.content.map((b) => b.type);
    const usedTool = types.some(
      (t) => t === "server_tool_use" || String(t).includes("web_search") || String(t).includes("web_fetch"),
    );
    return {
      type: toolType,
      verdict: "ACCEPTED",
      usedTool,
      stop_reason: res.stop_reason,
      blockTypes: types,
    };
  } catch (err) {
    return {
      type: toolType,
      verdict: "REJECTED",
      status: err?.status,
      errorType: err?.error?.error?.type ?? err?.name,
      message: err?.message,
    };
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Load it: export $(grep -v '^#' .env.local | xargs)");
    process.exit(2);
  }
  console.log(`Model: ${MODEL}\n`);
  for (const [type, name] of [
    ["web_search_20260209", "web_search"],
    ["web_fetch_20260209", "web_fetch"],
  ]) {
    console.log(`→ probing ${type} …`);
    const r = await probe(type, name);
    console.log(JSON.stringify(r, null, 2));
    console.log("");
  }
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
