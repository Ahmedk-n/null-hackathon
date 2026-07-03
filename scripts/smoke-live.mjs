// Live smoke test — proves the ANTHROPIC_API_KEY wired into .env.local actually
// reaches Anthropic end-to-end through the running dev server.
//
// The agents NEVER throw: on a missing/invalid key or any API error they silently
// replay the scripted fixture. So the only trustworthy signal that the live path
// worked is a final `done` event whose `source === "live"`. A "fixture" result
// means the live call failed and fell back — the test treats that as a failure.
//
// Usage:
//   node scripts/smoke-live.mjs                 # business path (fast, no git clone)
//   node scripts/smoke-live.mjs technical       # technical path (clones a repo)
//   BASE_URL=http://localhost:3001 node scripts/smoke-live.mjs
//
// Requires the dev server to be running (`npm run dev`).

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const mode = process.argv[2] ?? "business";

// Small, real inputs so the live agents have something to actually research.
const CASES = {
  business: {
    kind: "business",
    source: { website: "https://www.anthropic.com", competitors: ["OpenAI"] },
  },
  technical: {
    kind: "technical",
    source: { repoUrl: "https://github.com/anthropics/anthropic-sdk-typescript" },
  },
};

const body = CASES[mode];
if (!body) {
  console.error(`Unknown mode "${mode}". Use "business" or "technical".`);
  process.exit(2);
}

/** Parse a full SSE payload into the AgentEvent objects it carried. */
function parseSSE(text) {
  return text
    .split("\n\n")
    .filter((c) => c.includes("data:"))
    .map((chunk) => {
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      return JSON.parse(line.slice(5).trim());
    });
}

async function main() {
  console.log(`→ POST ${BASE_URL}/api/gather  (${mode})`);
  console.log(`  input: ${JSON.stringify(body.source)}\n`);

  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/gather`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`✗ HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  if (res.headers.get("content-type") !== "text/event-stream") {
    console.error(`✗ expected text/event-stream, got ${res.headers.get("content-type")}`);
    process.exit(1);
  }

  const events = parseSSE(await res.text());
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  // Echo the streamed progress so you can watch the agent's real work.
  for (const e of events) {
    if (e.type === "status") console.log(`  … ${e.message}`);
    else if (e.type === "finding") console.log(`  • ${e.finding.label}: ${e.finding.value}  [${e.finding.source}]`);
    else if (e.type === "error") console.log(`  ! error: ${e.message}`);
  }

  const done = events.find((e) => e.type === "done");
  console.log(`\n  ${events.length} events in ${elapsed}s`);

  if (!done) {
    console.error("✗ FAIL — stream never produced a `done` event");
    process.exit(1);
  }

  console.log(`\n  summary: ${done.findings.summary}`);
  console.log(`  facts:   ${done.findings.facts.length}`);
  console.log(`  source:  ${done.source}`);

  if (done.source === "live") {
    console.log("\n✓ PASS — key works, response came from a real Anthropic call.");
    process.exit(0);
  }
  console.error(
    "\n✗ FAIL — got `fixture`, not `live`. The key/API call failed and the agent " +
      "fell back to canned data. Check the dev-server terminal for the swallowed error, " +
      "and confirm ANTHROPIC_API_KEY in .env.local is valid.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`✗ request failed: ${err.message}`);
  console.error("  Is the dev server running? Try: npm run dev");
  process.exit(1);
});
