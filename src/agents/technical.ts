// Technical agent: shallow-clone a repo into an OS temp dir, build a digest, then let
// a Claude tool_runner explore it with three read-only, path-confined tools. Falls back
// to the scripted fixture on no key / no repoUrl / any error. Never throws.
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir, readFile, stat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z as z4 } from "zod/v4";
import type { Emit, GatherFinding, GatherFindings, Now, TechnicalSource } from "./types";
import { collectText, extractFindings } from "./schemas";
import { replayFixture } from "./fixtures";
import { rejectAfter } from "./retry";

const MODEL = "claude-opus-4-8";
const CLONE_TIMEOUT_MS = 60_000;
// Per-turn deadline on each tool_runner LLM call, plus a hard ceiling on the whole
// multi-turn loop so a slow turn can never freeze the demo. maxRetries: 1 honors the
// "retry once then fall back to a fixture" guardrail at each turn; on final failure the
// runner rejects and the existing catch → replayFixture fallback fires.
const REQUEST_TIMEOUT_MS = 30_000;
const RUNNER_DEADLINE_MS = 90_000;
const MAX_ENTRIES = 200;
const MAX_FILE_CHARS = 20_000;
const MANIFEST_FILES = ["package.json", "pyproject.toml", "go.mod", "requirements.txt"];

const execAsync = promisify(exec);

function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Single-quote a string for safe use as one shell argument. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

interface Digest {
  facts: GatherFinding[];
  text: string;
}

/** Bounded recursive walk returning repo-relative POSIX paths (files only). */
async function walk(root: string, cap: number): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [root];
  while (queue.length > 0 && out.length < cap) {
    const dir = queue.shift() as string;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile()) {
        out.push(path.relative(root, full).split(path.sep).join("/"));
        if (out.length >= cap) break;
      }
    }
  }
  return out;
}

async function buildDigest(root: string): Promise<Digest> {
  const files = await walk(root, MAX_ENTRIES);
  const has = (name: string) => files.some((f) => f === name || f.endsWith("/" + name));
  const facts: GatherFinding[] = [];

  const manifest = MANIFEST_FILES.find((m) => has(m));
  if (manifest) {
    facts.push({ label: "Manifest", value: manifest, source: manifest });
  }
  if (has("Dockerfile")) {
    facts.push({ label: "Containerization", value: "Dockerfile present", source: "Dockerfile" });
  }
  const ci = files.find((f) => f.startsWith(".github/workflows/"));
  if (ci) {
    facts.push({ label: "CI", value: "GitHub Actions workflow present", source: ci });
  }
  const testDir = files.find((f) => f.startsWith("tests/") || f.startsWith("test/"));
  if (testDir) {
    facts.push({ label: "Tests", value: "Test suite present", source: testDir.split("/")[0] + "/" });
  }

  // Manifest / README heads for the model prompt.
  const heads: string[] = [`Repository file listing (capped at ${MAX_ENTRIES}):\n${files.join("\n")}`];
  for (const name of [...MANIFEST_FILES, "README.md", "README.rst", "README"]) {
    const rel = files.find((f) => f === name || f.endsWith("/" + name));
    if (!rel) continue;
    try {
      const content = await readFile(path.join(root, rel), "utf8");
      heads.push(`\n----- ${rel} (head) -----\n${content.slice(0, 4_000)}`);
    } catch {
      /* ignore */
    }
  }

  return { facts, text: heads.join("\n") };
}

const TECH_SYSTEM = `You are Keystone's technical context agent. You are exploring a cloned code repository
using three read-only tools (list_dir, read_file, grep), all confined to the repo root.
Determine the real technical context a founder would paste into a decision tool: the stack
and framework, architecture (monolith vs services), infrastructure, integrations, deployment
process, observability maturity, testing/CI, technical-debt signals, and any team-size hints.

Explore efficiently (a handful of tool calls), then STOP and return your answer as a single
JSON object and nothing else, matching exactly:
{
  "kind": "technical",
  "summary": "<3-5 sentences suitable to paste into a context textarea>",
  "facts": [ { "label": "...", "value": "...", "source": "<file path you found it in>" } ]
}
Every fact's "source" MUST be a file path from the repo. Produce at least 5 facts. Do not invent
files that do not exist.`;

export async function gatherTechnical(
  source: TechnicalSource,
  emit: Emit,
  now: Now,
): Promise<GatherFindings> {
  const fallback = () => replayFixture("technical", emit, now);
  if (!hasApiKey() || !source.repoUrl) return fallback();

  let dir: string | null = null;
  try {
    emit({ type: "status", message: `Cloning ${source.repoUrl} (shallow, depth 1)…`, ts: now() });
    dir = await mkdtemp(path.join(tmpdir(), "keystone-repo-"));
    const cloneDir = dir;
    const branchArg = source.branch ? `--branch ${shq(source.branch)} ` : "";
    await execAsync(
      `git clone --depth 1 ${branchArg}${shq(source.repoUrl)} ${shq(cloneDir)}`,
      { timeout: CLONE_TIMEOUT_MS },
    );
    const rootReal = await realpath(cloneDir);

    emit({ type: "status", message: "Building repository digest…", ts: now() });
    const digest = await buildDigest(cloneDir);
    for (const f of digest.facts) emit({ type: "finding", finding: f, ts: now() });

    // Resolve a model-supplied relative path and confine it to the clone dir.
    // Rejects `..`, absolute-outside, and symlink escapes. Returns null if it escapes.
    const confine = async (rel: string): Promise<string | null> => {
      const resolved = path.resolve(rootReal, rel);
      if (resolved !== rootReal && !resolved.startsWith(rootReal + path.sep)) return null;
      try {
        const real = await realpath(resolved);
        if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null;
        return real;
      } catch {
        return null; // does not exist / not accessible
      }
    };

    const listDir = betaZodTool({
      name: "list_dir",
      description: "List entries of a directory within the repo. `path` is relative to the repo root ('' or '.' = root).",
      inputSchema: z4.object({ path: z4.string() }),
      run: async ({ path: rel }) => {
        const abs = await confine(rel || ".");
        if (!abs) return "ERROR: path escapes the repository root.";
        try {
          const entries = await readdir(abs, { withFileTypes: true });
          return entries
            .filter((e) => e.name !== ".git")
            .slice(0, MAX_ENTRIES)
            .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
            .join("\n");
        } catch {
          return "ERROR: not a directory or unreadable.";
        }
      },
    });

    const readFileTool = betaZodTool({
      name: "read_file",
      description: "Read a UTF-8 text file within the repo. `path` is relative to the repo root. Output is capped.",
      inputSchema: z4.object({ path: z4.string() }),
      run: async ({ path: rel }) => {
        const abs = await confine(rel);
        if (!abs) return "ERROR: path escapes the repository root.";
        try {
          const s = await stat(abs);
          if (!s.isFile()) return "ERROR: not a file.";
          const content = await readFile(abs, "utf8");
          return content.length > MAX_FILE_CHARS
            ? content.slice(0, MAX_FILE_CHARS) + "\n…[truncated]"
            : content;
        } catch {
          return "ERROR: unreadable (binary or missing).";
        }
      },
    });

    const grepTool = betaZodTool({
      name: "grep",
      description: "Search the repo's text files for a regular expression. Returns up to 50 matching 'path:line' entries.",
      inputSchema: z4.object({ pattern: z4.string() }),
      run: async ({ pattern }) => {
        let re: RegExp;
        try {
          re = new RegExp(pattern);
        } catch {
          re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        }
        const files = await walk(rootReal, MAX_ENTRIES);
        const hits: string[] = [];
        for (const rel of files) {
          if (hits.length >= 50) break;
          try {
            const content = await readFile(path.join(rootReal, rel), "utf8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length && hits.length < 50; i++) {
              if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
            }
          } catch {
            /* skip binary */
          }
        }
        return hits.length ? hits.join("\n") : "No matches.";
      },
    });

    emit({ type: "status", message: "Exploring with read-only tools (list_dir / read_file / grep)…", ts: now() });

    const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 8_000,
      max_iterations: 8,
      system: TECH_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Repo: ${source.repoUrl}\n\nInitial digest to orient you (explore further with the tools if needed):\n\n` +
            digest.text,
        },
      ],
      tools: [listDir, readFileTool, grepTool],
    });

    const final = await Promise.race([
      runner.runUntilDone(),
      rejectAfter(RUNNER_DEADLINE_MS, "technical tool_runner"),
    ]);
    const findings = extractFindings(collectText(final.content));
    if (findings) {
      findings.kind = "technical";
      emit({ type: "status", message: "Summarizing technical context…", ts: now() });
      for (const f of findings.facts) emit({ type: "finding", finding: f, ts: now() });
      emit({ type: "done", findings, source: "live", ts: now() });
      return findings;
    }
    return fallback();
  } catch {
    return fallback();
  } finally {
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
}
