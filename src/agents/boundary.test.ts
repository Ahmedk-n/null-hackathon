import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// Repo `src/` root (this file lives at src/agents/boundary.test.ts).
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Strings that would drag an agent server module or the Anthropic SDK into the browser bundle.
// (Type-only imports from `@/agents/types` are fine and intentionally NOT listed.)
const FORBIDDEN = [
  "@/agents/technical",
  "@/agents/business",
  "@/agents/temporal",
  "@/agents/compile",
  "@anthropic-ai/sdk",
];

// Barrels that re-export server-only code (agent dispatchers / context compile). A
// *value* import pulls that code into the client bundle; a type-only import does not.
// Forbidden as value imports, allowed as `import type` (use deep pure paths otherwise).
const FORBIDDEN_VALUE_IMPORTS = ["@/agents", "@/context"];

// True iff `src` has a value (non-type-only) import from exactly `module`. The clause
// forbids `;` so a single match can't span two statements, and the trailing quote pins
// the exact module (so deep paths like `@/agents/types` are NOT matched).
function hasValueImport(src: string, module: string): boolean {
  const esc = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`import\\s+([^;]*?)\\bfrom\\s*["']${esc}["']`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!/^\s*type\b/.test(m[1])) return true; // statement-level `import type` is allowed
  }
  return false;
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

const isTest = (p: string) => p.endsWith(".test.ts") || p.endsWith(".test.tsx");

const allFiles = walk(SRC_ROOT).filter(
  (p) => (p.endsWith(".ts") || p.endsWith(".tsx")) && !isTest(p),
);

// Every "use client" file anywhere ...
const clientFiles = allFiles.filter((p) => readFileSync(p, "utf8").includes('"use client"'));
// ... plus everything under src/store/**.
const storeFiles = allFiles.filter((p) => p.includes(`${join(SRC_ROOT, "store")}`));

const guarded = Array.from(new Set([...clientFiles, ...storeFiles]));

describe("agent key-safety boundary (redesign §3.1)", () => {
  it("finds client/store files to guard", () => {
    expect(guarded.length).toBeGreaterThan(0);
  });

  for (const file of guarded) {
    const rel = file.slice(SRC_ROOT.length + 1);
    it(`${rel} imports no agent server module or Anthropic SDK`, () => {
      const src = readFileSync(file, "utf8");
      const hits = [
        ...FORBIDDEN.filter((s) => src.includes(s)),
        ...FORBIDDEN_VALUE_IMPORTS.filter((m) => hasValueImport(src, m)),
      ];
      expect(hits, `${rel} must not reference ${hits.join(", ")}`).toEqual([]);
    });
  }
});
