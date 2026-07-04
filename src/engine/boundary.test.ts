import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Engine purity guard (harvested from origin/founder-a/context-core, adapted to OUR file list).
 * src/engine/** must stay a pure, deterministic module: no imports from the context/LLM/UI/canvas
 * layers, no React/Next/Zustand/store, and no Anthropic SDK. This keeps "the engine decides" free
 * of "the LLM proposes" and lets the engine be imported into the browser bundle safely.
 *
 * Future-proof: it GLOBS the engine dir (readdirSync), so any new engine source file is checked
 * automatically. Our current sources are types/propagation/load/sensitivity/reinforce/explain/index.
 */
const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN: RegExp[] = [
  /@\/context/,
  /@\/llm/,
  /@\/ui/,
  /@\/canvas/,
  /@\/store/,
  /@\/agents/,
  /['"]react['"]/,
  /['"]react\//,
  /['"]next['"]/,
  /['"]next\//,
  /['"]zustand['"]/,
  /@anthropic-ai\/sdk/,
];

function importLines(src: string): string[] {
  return src
    .split("\n")
    .filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l) || /\brequire\(/.test(l));
}

describe("engine purity boundary", () => {
  // Scan SOURCE files only. Test harnesses (*.test.ts) are dev-only and may legitimately import
  // fixtures from @/context; they are never shipped and do not affect the engine's runtime graph.
  const files = readdirSync(ENGINE_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("finds engine source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} imports nothing forbidden`, () => {
      const src = readFileSync(join(ENGINE_DIR, file), "utf8");
      const lines = importLines(src);
      for (const line of lines) {
        for (const pattern of FORBIDDEN) {
          expect(pattern.test(line), `forbidden import in ${file}: ${line.trim()}`).toBe(false);
        }
      }
    });
  }
});
