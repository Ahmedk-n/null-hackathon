import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// Repo `src/` root (this file lives at src/store/boundary.test.ts).
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Strings that would drag the Anthropic SDK / API key into the browser bundle.
const FORBIDDEN = [
  "@anthropic-ai/sdk",
  "@/llm/client",
  "@/context/compile",
  "process.env.ANTHROPIC_API_KEY",
];

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

// ... plus every client-bundle file ("use client") anywhere (store, ui, canvas, app).
const clientFiles = allFiles.filter(
  (p) => (p.endsWith(".tsx") || p.endsWith(".ts")) && !isTest(p) && readFileSync(p, "utf8").includes('"use client"'),
);

const guarded = Array.from(new Set([...storeFiles, ...clientFiles]));

describe("client/key-safety boundary (§9)", () => {
  it("finds files to guard", () => {
    expect(guarded.length).toBeGreaterThan(0);
  });

  for (const file of guarded) {
    const rel = file.slice(SRC_ROOT.length + 1);
    it(`${rel} imports no server-only / key-reading module`, () => {
      const src = readFileSync(file, "utf8");
      const hits = FORBIDDEN.filter((s) => src.includes(s));
      expect(hits, `${rel} must not reference ${hits.join(", ")}`).toEqual([]);
    });
  }
});
