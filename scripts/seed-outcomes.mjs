// scripts/seed-outcomes.mjs
//
// P2-T6 · dev-only demo seed for cross-decision calibration. NOT imported by the app, NOT run in
// tests/CI — a one-off script you run by hand against a LOCAL dev server, authenticated as a real
// signed-in user, to populate the REAL (Supabase-backed) resolution path with a visible bias.
//
// It POSTs ~8 decisions with a high predictedPHold (the model was confident the keystone
// assumption would HOLD), then PATCHes each one's outcome — split roughly half "held" / half
// "failed" — a systematic "over-holder": predictedMean sits well above rawHoldRate. That's exactly
// the bias src/lib/library/calibration.ts's shrunk-Platt fit exists to correct, so this gives the
// calibration UI (fetchCalibration / the account+studio display) something real to show.
//
// USAGE
//   1. Start the dev server (in another terminal):
//        npm run dev                            # http://localhost:3000 by default
//   2. Sign in as the demo user in a browser (normal email/password or OAuth login flow).
//   3. Grab the session cookie for that origin:
//        - DevTools → Application (or Storage) → Cookies → copy every cookie for the dev origin,
//          formatted as a single "name=value; name2=value2; ..." header string, OR
//        - run `document.cookie` in the DevTools console and paste that string directly.
//      It must include the Supabase auth cookie(s) (typically named like
//      `sb-<project-ref>-auth-token`, sometimes split into `.0`/`.1` chunks) — grab the whole
//      cookie jar for the origin rather than hand-picking one name, since Supabase may chunk it.
//   4. Run this script with that cookie:
//        SESSION_COOKIE='sb-xxxx-auth-token=...; sb-xxxx-auth-token.0=...' node scripts/seed-outcomes.mjs
//      Optionally point at a different origin/port:
//        BASE_URL=http://localhost:3002 SESSION_COOKIE='...' node scripts/seed-outcomes.mjs
//
// Every decision is created fresh (no de-dup) — safe to re-run, but re-running adds MORE rows
// rather than replacing the previous seed run. Delete via the account page's "Delete account" (or
// individual entries) if you want a clean slate.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.SESSION_COOKIE ?? process.env.COOKIE;

if (!COOKIE) {
  console.error(
    [
      "Missing SESSION_COOKIE.",
      "",
      `1. Sign in at ${BASE_URL} in a browser.`,
      "2. Copy the session cookie (DevTools → Application → Cookies, or `document.cookie` in the console).",
      "3. Re-run:",
      "     SESSION_COOKIE='...' node scripts/seed-outcomes.mjs",
      "",
      "See the header comment in this file for the full walkthrough.",
    ].join("\n"),
  );
  process.exit(1);
}

// Fixed (not random) fixture cases — an "over-holder" pattern: predictedPHold is consistently
// high (0.79–0.88) yet only half actually held, so rawHoldRate << predictedMean.
const CASES = [
  { title: "Migrate billing to microservices", predictedPHold: 0.86, outcome: "failed", category: "integration" },
  { title: "Adopt a new ORM company-wide", predictedPHold: 0.82, outcome: "held", category: "adoption" },
  { title: "Replace the on-call rotation tool", predictedPHold: 0.79, outcome: "failed", category: "process" },
  { title: "Ship the pricing-page redesign", predictedPHold: 0.88, outcome: "held", category: "market" },
  { title: "Consolidate onto a single cloud region", predictedPHold: 0.83, outcome: "failed", category: "infra" },
  { title: "Hire a dedicated SRE team", predictedPHold: 0.81, outcome: "held", category: "org" },
  { title: "Rebuild auth on a third-party IdP", predictedPHold: 0.85, outcome: "failed", category: "integration" },
  { title: "Launch the partner API program", predictedPHold: 0.8, outcome: "held", category: "market" },
];

function slugFor(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
}

function graphFor(title) {
  const slug = slugFor(title);
  return {
    thesisId: `thesis-${slug}`,
    nodes: [
      { id: `thesis-${slug}`, type: "thesis", label: title, confidence: 0.8, groups: [{ kind: "AND", childIds: [`keystone-${slug}`] }] },
      { id: `keystone-${slug}`, type: "assumption", label: "Key assumption holds", confidence: 0.75, groups: [] },
    ],
  };
}

function verdictFor() {
  return { integrity: 74, keystoneId: null, failedIds: [], loadApplied: false };
}

async function postDecision(seed) {
  const res = await fetch(`${BASE_URL}/api/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: COOKIE },
    body: JSON.stringify({
      title: seed.title,
      mode: "custom",
      input: {
        businessContextText: `Seed demo: ${seed.title}`,
        technicalContextText: "",
        temporalContextText: "",
        decisionText: seed.title,
      },
      companyContext: null,
      pack: null,
      graph: graphFor(seed.title),
      verdict: verdictFor(),
      predictedPHold: seed.predictedPHold,
    }),
  });
  if (!res.ok) {
    console.error(`  x POST failed (${res.status}) for "${seed.title}": ${await res.text().catch(() => "")}`);
    return null;
  }
  const body = await res.json().catch(() => null);
  return body?.entry ?? null;
}

async function patchOutcome(id, seed) {
  const res = await fetch(`${BASE_URL}/api/decisions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: COOKIE },
    body: JSON.stringify({
      outcome: seed.outcome,
      materializedCategories: seed.outcome === "failed" ? [seed.category] : [],
    }),
  });
  if (!res.ok) {
    console.error(`  x PATCH failed (${res.status}) for "${seed.title}": ${await res.text().catch(() => "")}`);
    return null;
  }
  const body = await res.json().catch(() => null);
  return body?.entry ?? null;
}

async function main() {
  console.log(`Seeding ${CASES.length} demo decisions against ${BASE_URL} ...`);
  let ok = 0;
  for (const seed of CASES) {
    const saved = await postDecision(seed);
    if (!saved) continue;
    const resolved = await patchOutcome(saved.id, seed);
    if (resolved) {
      ok++;
      console.log(`  - "${seed.title}" — predicted ${seed.predictedPHold} -> ${seed.outcome}`);
    }
  }
  console.log(`\nDone: ${ok}/${CASES.length} decisions seeded and resolved.`);
  if (ok > 0) {
    console.log("Sign in as this same user and open the calibration display (account / studio) to see the bias.");
  } else {
    console.log("Nothing was seeded — check SESSION_COOKIE / BASE_URL and that the dev server is running.");
  }
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
