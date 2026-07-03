import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Engine purity guard. src/engine/** must stay a pure, deterministic module:
 * no imports from the context/LLM/UI layers, no React/Next/Zustand, and no
 * Anthropic SDK. This keeps "the engine decides" free of "the LLM proposes".
 */
const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN: RegExp[] = [
  /@\/context/,
  /@\/llm/,
  /@\/ui/,
  /@\/canvas/,
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
  const files = readdirSync(ENGINE_DIR).filter((f) => f.endsWith(".ts"));

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
