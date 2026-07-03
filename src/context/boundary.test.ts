import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Key-safety guard for the Founder A layers. The Anthropic SDK and the API key
 * must only appear in server-intended modules. Client-safe modules (context
 * types/schemas/weights/fixtures/index) and the whole engine must be free of
 * both, so they can be bundled into the browser without leaking the key.
 */
const CONTEXT_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = dirname(CONTEXT_DIR);
const LLM_DIR = join(SRC_DIR, "llm");
const ENGINE_DIR = join(SRC_DIR, "engine");

// The ONLY files allowed to touch the SDK / key directly.
const SERVER_ONLY = new Set(["structured.ts"]);

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

describe("key-safety boundary", () => {
  const clientSafe = [
    join(CONTEXT_DIR, "types.ts"),
    join(CONTEXT_DIR, "schemas.ts"),
    join(CONTEXT_DIR, "weights.ts"),
    join(CONTEXT_DIR, "fixtures.ts"),
    join(CONTEXT_DIR, "index.ts"),
    ...tsFiles(ENGINE_DIR),
  ];

  for (const file of clientSafe) {
    it(`${file.split("/src/")[1]} does not touch the SDK or the API key`, () => {
      expect(usesSdkOrKey(readFileSync(file, "utf8"))).toBe(false);
    });
  }

  it("only structured.ts imports @anthropic-ai/sdk under src/llm and src/context", () => {
    const offenders: string[] = [];
    for (const file of [...tsFiles(LLM_DIR), ...tsFiles(CONTEXT_DIR)]) {
      const base = file.split("/").pop()!;
      if (importsSdk(readFileSync(file, "utf8")) && !SERVER_ONLY.has(base)) {
        offenders.push(base);
      }
    }
    expect(offenders).toEqual([]);
  });
});
