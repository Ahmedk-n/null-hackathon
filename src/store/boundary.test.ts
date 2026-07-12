import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// Repo `src/` root (this file lives at src/store/boundary.test.ts).
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Strings that would drag the Anthropic SDK / API key into the browser bundle. The bare
// key-name literals (P5-T13) are a superset of the older `process.env.` -qualified entry
// (kept for history/clarity) — a stray `const { SUPABASE_SECRET_KEY } = process.env` or a
// same string re-exported under another name is caught either way.
const FORBIDDEN = [
  "@anthropic-ai/sdk",
  "@/llm/client",
  "@/context/compile",
  "process.env.ANTHROPIC_API_KEY",
  "SUPABASE_SECRET_KEY",
  "ANTHROPIC_API_KEY",
];

// Barrels / server-only modules that must never be VALUE-imported into the client bundle or the
// store (compile / agent dispatchers, the Supabase service-role client, the cookie-reading SSR
// client). A type-only import is fine (erased at compile time; see `hasValueImport`) — deep pure
// paths like `@/context/weights` remain the right way to pull real functions. NOTE:
// `@/lib/supabase/client` is intentionally NOT on this list — it's the client-safe anon client
// used by useSession/account, not a key-reading module.
const FORBIDDEN_VALUE_IMPORTS = ["@/context", "@/agents", "@/lib/supabase/admin", "@/lib/supabase/server"];

// P5-T13: close the loophole above — ANY submodule under these two directories is forbidden as a
// value import, not just the barrel (agent orchestration / LLM-calling code, which reads the
// Anthropic key, must never be reachable from a client bundle or the store). Two pre-existing deep
// imports are exempted below because each has been hand-verified to be pure, key-free, SDK-free
// data/validation code (no `@anthropic-ai/sdk`, no secret-key literal, anywhere in the module).
const FORBIDDEN_VALUE_PREFIXES = ["@/agents/", "@/llm/"];
const ALLOWED_DEEP_VALUE_IMPORTS = new Set([
  // src/store/useKeystone.ts — the manual-edit validation wall: engine-type + normaliseCategory
  // only, never the SDK or a key.
  "@/llm/validate",
]);

// True iff `src` has a value (non-type-only) import from exactly `module`. The clause
// forbids `;` so a single match can't span two statements, and the trailing quote
// pins the exact module (so `@/context/weights` etc. are NOT matched).
function hasValueImport(src: string, module: string): boolean {
  const esc = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`import\\s+([^;]*?)\\bfrom\\s*["']${esc}["']`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!/^\s*type\b/.test(m[1])) return true; // statement-level `import type` is allowed
  }
  return false;
}

// Every non-type-only import whose module string starts with one of FORBIDDEN_VALUE_PREFIXES and
// isn't on the narrow ALLOWED_DEEP_VALUE_IMPORTS allowlist above.
function forbiddenPrefixImports(src: string): string[] {
  const re = /import\s+([^;]*?)\bfrom\s*["']([^"']+)["']/g;
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const [, clause, mod] = m;
    if (/^\s*type\b/.test(clause)) continue; // type-only never ships code
    if (FORBIDDEN_VALUE_PREFIXES.some((p) => mod.startsWith(p)) && !ALLOWED_DEEP_VALUE_IMPORTS.has(mod)) {
      hits.push(mod);
    }
  }
  return hits;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const allFiles = walk(SRC_ROOT);

// Tests themselves are never shipped to the browser; exclude them so this guard
// (which necessarily names the forbidden strings) does not flag itself.
const isTest = (p: string) => p.endsWith(".test.ts") || p.endsWith(".test.tsx");

// Everything under src/store/** ...
const storeFiles = allFiles.filter((p) => p.includes(`${join(SRC_ROOT, "store")}`) && !isTest(p));

// A real Next.js client-component directive is the literal FIRST statement in the file (Next
// requires it above any imports). Checking that — rather than a bare `.includes('"use client"')`
// anywhere in the source — avoids sweeping in server files whose comments merely *mention* the
// directive (e.g. "NEVER import from a \"use client\" file", found in src/lib/supabase/admin.ts)
// as false positives once the checks below get stricter (P5-T13).
function isClientDirective(src: string): boolean {
  const t = src.trimStart();
  return t.startsWith('"use client"') || t.startsWith("'use client'");
}

// ... plus every client-bundle file ("use client") anywhere (store, ui, canvas, app).
const clientFiles = allFiles.filter(
  (p) => (p.endsWith(".tsx") || p.endsWith(".ts")) && !isTest(p) && isClientDirective(readFileSync(p, "utf8")),
);

// Phase 2 whole-feature fix (boundary-test gap): src/lib/library/** and src/context/** are
// client-reachable (calibration.ts / fixtureOutcomes.ts / index.ts etc. are imported straight
// into the store and client tabs) but carry neither a "use client" directive nor live under
// src/store/ — so neither filter above ever scanned them. Add them explicitly.
//
// EXCLUDED: src/context/compile.ts. It is a genuinely server-only module (the live context
// compiler, invoked only from the /api/context route) that value-imports @/agents/retry and
// @/llm/structured on purpose — sanctioned and already verified by its OWN dedicated guard, the
// "only sanctioned server transports" check in src/context/boundary.test.ts's SERVER_ONLY set.
// It is not reachable from the client bundle: the "@/context" barrel (which re-exports it) is
// itself forbidden as a value import (see FORBIDDEN_VALUE_IMPORTS above), and no client file
// imports "@/context/compile" directly (also explicitly forbidden, see FORBIDDEN above).
// Scanning compile.ts here would therefore flag a already-sanctioned server transport, not an
// actual client-reachability leak — the same reasoning src/context/boundary.test.ts already
// encodes for this exact file.
const libraryFiles = allFiles.filter(
  (p) => p.includes(`${join(SRC_ROOT, "lib", "library")}`) && !isTest(p),
);
const contextFiles = allFiles.filter(
  (p) =>
    p.includes(`${join(SRC_ROOT, "context")}`) &&
    !isTest(p) &&
    p !== join(SRC_ROOT, "context", "compile.ts"),
);

const guarded = Array.from(new Set([...storeFiles, ...clientFiles, ...libraryFiles, ...contextFiles]));

describe("client/key-safety boundary (§9)", () => {
  it("finds files to guard", () => {
    expect(guarded.length).toBeGreaterThan(0);
  });

  for (const file of guarded) {
    const rel = file.slice(SRC_ROOT.length + 1);
    it(`${rel} imports no server-only / key-reading module`, () => {
      const src = readFileSync(file, "utf8");
      const hits = [
        ...FORBIDDEN.filter((s) => src.includes(s)),
        ...FORBIDDEN_VALUE_IMPORTS.filter((m) => hasValueImport(src, m)),
        ...forbiddenPrefixImports(src),
      ];
      expect(hits, `${rel} must not reference ${hits.join(", ")}`).toEqual([]);
    });
  }
});
