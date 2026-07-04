import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Key-safety guard for the context + engine + llm layers (absorbed from founder-a,
 * ADAPTED to our tree). The Anthropic SDK and the API key must only appear in
 * server-intended modules. Client-safe modules (context types/schemas/weights/
 * fixtures/constraints/timeline/tunnel/index) and the WHOLE engine must be free of
 * both, so they can be bundled into the browser without leaking the key.
 *
 * Where founder-a allowed only `structured.ts` as the sole SDK importer, our tree
 * is a product superset with several proven-live transports already in place. So
 * the sanctioned-importer allowlist is EXTENDED to our existing server transports
 * (client.ts / design.ts / reinforce.ts / compile.ts) PLUS the newly-absorbed
 * structured.ts — the additive Wave-A landing this test is guarding.
 */
const CONTEXT_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = dirname(CONTEXT_DIR);
const LLM_DIR = join(SRC_DIR, "llm");
const ENGINE_DIR = join(SRC_DIR, "engine");

// The ONLY files under src/llm + src/context allowed to touch the SDK / key directly.
// structured.ts is the founder-a absorption; the rest are our existing live transports.
const SERVER_ONLY = new Set([
  "structured.ts", // absorbed forced-tool-call transport (Wave A)
  "client.ts", // extractStructure / generateAttacks live chain
  "design.ts", // design-candidate generation
  "reinforce.ts", // reinforcement suggestion
  "compile.ts", // context compiler (lives under src/context)
]);

function tsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

function importsSdk(src: string): boolean {
  return src
    .split("\n")
    .some(
      (l) =>
        (/^\s*(import|export)\b.*\bfrom\b/.test(l) || /\brequire\(/.test(l)) &&
        /@anthropic-ai\/sdk/.test(l),
    );
}

function usesSdkOrKey(src: string): boolean {
  // Only real imports of the SDK count (doc comments listing it as forbidden
  // must not trip the guard); the API-key env token is flagged wherever it appears.
  return importsSdk(src) || /process\.env\.ANTHROPIC_API_KEY/.test(src);
}

describe("key-safety boundary (context + engine + llm)", () => {
  // Every non-server context file plus the entire engine must be bundle-safe.
  const clientSafe = [
    ...tsFiles(CONTEXT_DIR).filter((f) => !SERVER_ONLY.has(f.split("/").pop()!)),
    ...tsFiles(ENGINE_DIR),
  ];

  it("finds client-safe files to guard", () => {
    expect(clientSafe.length).toBeGreaterThan(0);
  });

  for (const file of clientSafe) {
    it(`${file.split("/src/")[1]} does not touch the SDK or the API key`, () => {
      expect(usesSdkOrKey(readFileSync(file, "utf8"))).toBe(false);
    });
  }

  it("only sanctioned server transports import @anthropic-ai/sdk under src/llm and src/context", () => {
    const offenders: string[] = [];
    for (const file of [...tsFiles(LLM_DIR), ...tsFiles(CONTEXT_DIR)]) {
      const base = file.split("/").pop()!;
      if (importsSdk(readFileSync(file, "utf8")) && !SERVER_ONLY.has(base)) {
        offenders.push(base);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("structured.ts is on the sanctioned SDK-importer allowlist", () => {
    expect(SERVER_ONLY.has("structured.ts")).toBe(true);
  });
});
