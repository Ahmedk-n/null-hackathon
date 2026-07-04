// Technical agent: shallow-clone a repo into an OS temp dir, build a DEEP deterministic digest
// (file listing + manifest/CI/Dockerfile heads + local grep signals + counts), then a single
// forced-tool emit_findings call converts that digest into the rich typed schema. Falls back to
// the scripted fixture on no key / no repoUrl / any error. Never throws.
//
// V8-C5-fix — WHY NO tool_runner: the previous two-phase design let a claude-opus-4-8 tool_runner
// interactively explore with read_file/grep, then a forced-emit finalizer. In practice a SINGLE
// opus tool_runner turn regularly exceeded the per-turn timeout (>60s even on a medium repo), so
// the loop threw and every live run silently fell back to fixture (the V8 regression). The digest
// already gathers the same real repo facts deterministically (no model latency), and one forced
// structuredCall over it lands rich findings in ~20-30s — reliable AND live. The read is still
// genuine (real clone, real file contents, real grep hits); only the file-selection is now
// deterministic instead of model-driven.
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Emit, GatherFinding, GatherFindings, Now, TechnicalSource } from "./types";
import { GatherFindingsSchema, MIN_FACTS } from "./schemas";
import { replayFixture } from "./fixtures";
import { retryOnce } from "./retry";
import { structuredCall } from "@/llm/structured";

const CLONE_TIMEOUT_MS = 60_000;
const MAX_ENTRIES = 200;
const MAX_FILE_CHARS = 6_000; // per-file head in the digest (keeps the emit prompt bounded)
const MANIFEST_FILES = ["package.json", "pyproject.toml", "go.mod", "requirements.txt", "Cargo.toml", "pom.xml"];

// Grep signals surfaced deterministically into the digest so the finalizer can quote real hits.
const GREP_SIGNALS: { label: string; re: RegExp }[] = [
  { label: "tech-debt (TODO/FIXME/HACK)", re: /\b(TODO|FIXME|HACK|XXX)\b/ },
  { label: "observability", re: /opentelemetry|prometheus|structlog|opentracing|datadog|sentry|grafana/i },
  { label: "secrets/config", re: /API_KEY|SECRET|PASSWORD|ACCESS_TOKEN|PRIVATE_KEY/ },
  { label: "migrations", re: /\b(migrate|alembic|migration|flyway|liquibase)\b/i },
];

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

/** Grep the repo's text files for `re`, returning up to `cap` "path:line: text" hits. */
async function grepRepo(root: string, files: readonly string[], re: RegExp, cap: number): Promise<string[]> {
  const hits: string[] = [];
  for (const rel of files) {
    if (hits.length >= cap) break;
    try {
      const content = await readFile(path.join(root, rel), "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length && hits.length < cap; i++) {
        if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
      }
    } catch {
      /* skip binary / unreadable */
    }
  }
  return hits;
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
  const workflows = files.filter((f) => f.startsWith(".github/workflows/"));
  if (workflows.length) {
    facts.push({ label: "CI", value: "GitHub Actions workflow present", source: workflows[0] });
  }
  const testDir = files.find((f) => f.startsWith("tests/") || f.startsWith("test/"));
  if (testDir) {
    facts.push({ label: "Tests", value: "Test suite present", source: testDir.split("/")[0] + "/" });
  }

  // Deterministic counts the finalizer can turn into `quantities`.
  const testFileCount = files.filter((f) => /(^|\/)(tests?|__tests__|spec)\//i.test(f) || /\.(test|spec)\./i.test(f)).length;
  const cappedNote = files.length >= MAX_ENTRIES ? `${MAX_ENTRIES}+ (listing capped)` : `${files.length}`;

  const heads: string[] = [
    `Repository file listing (capped at ${MAX_ENTRIES}):\n${files.join("\n")}`,
    `\nCOUNTS: files=${cappedNote}; test files=${testFileCount}; CI workflows=${workflows.length}`,
  ];

  // Read the heads of the highest-signal files: every manifest + lockfiles + first CI workflow +
  // Dockerfile + README, so the finalizer has real dependency lists / versions / CI steps to quote.
  const keyFiles = [
    ...MANIFEST_FILES,
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "poetry.lock",
    "Dockerfile",
    "docker-compose.yml",
    "README.md",
    "README.rst",
    "README",
    ...workflows.slice(0, 2),
  ];
  for (const name of keyFiles) {
    const rel = name.includes("/") ? name : files.find((f) => f === name || f.endsWith("/" + name));
    if (!rel) continue;
    try {
      const content = await readFile(path.join(root, rel), "utf8");
      heads.push(`\n----- ${rel} (head) -----\n${content.slice(0, MAX_FILE_CHARS)}`);
    } catch {
      /* ignore */
    }
  }

  // Real grep hits for the signal patterns, so the finalizer can quote verbatim lines + counts.
  for (const { label, re } of GREP_SIGNALS) {
    const hits = await grepRepo(root, files, re, 12);
    heads.push(`\n----- grep: ${label} (${hits.length ? hits.length + "+ hits" : "no hits"}) -----\n${hits.join("\n") || "(none)"}`);
  }

  return { facts, text: heads.join("\n") };
}

// Forced-tool finalizer. Converts the deterministic digest (file listing + file heads + grep hits +
// counts) into the rich typed schema in one call — reliable and low-latency (no multi-turn loop).
const TECH_EMIT_SYSTEM = `You are Keystone's technical context agent. Below is a DIGEST of a code repository: its file
listing, verbatim heads of the key files (manifests, lockfiles, CI config, Dockerfile, README), real
grep hits for tech-debt / observability / secrets / migration signals, and deterministic counts.
Convert it into structured findings by calling the emit_findings tool. Use ONLY facts grounded in the
digest — never invent files, versions, or counts.

Determine the real technical context a founder would paste into a decision tool: stack/framework,
architecture (monolith vs services), infrastructure, deployment, observability maturity, testing/CI,
and technical-debt signals. Cross-reference across manifest ∧ lockfile ∧ CI ∧ Dockerfile ∧ src dirs.

For EACH fact populate the rich fields:
  - "label": short tag (e.g. "Framework", "CI", "Tests", "Observability", "Tech debt").
  - "value": a terse headline.
  - "source": the EXACT repo file path (or "src/") the fact came from.
  - "category": one of stack | infra | ci | tests | observability | team | tech-debt | integration.
  - "sourceExcerpt": a SHORT VERBATIM line/snippet from that file (or a grep hit) — real text from the digest.
  - "quantities": counts/versions as {metric,value,unit?} — e.g. {metric:"test files",value:"38"},
    {metric:"fastapi",value:"0.110"}, {metric:"services",value:"1"}, {metric:"total dependencies",value:"62"}.
  - "entities": named frameworks/libraries/tools (e.g. "FastAPI", "GitHub Actions", "pytest").
  - "implication": one sentence on why this matters for the founder's decision.
  - "confidence": 0..1.

Produce at least 5 facts, kind "technical". Prefer facts that carry a real sourceExcerpt and quantities.`;

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

    emit({ type: "status", message: "Building repository digest (files, manifests, CI, grep signals)…", ts: now() });
    const digest = await buildDigest(cloneDir);
    for (const f of digest.facts) emit({ type: "finding", finding: f, ts: now() });

    // Forced-tool finalizer over the deterministic digest — one bounded call, no multi-turn loop.
    emit({ type: "status", message: "Synthesizing technical findings (forced emit)…", ts: now() });
    const findings: GatherFindings = await retryOnce(() =>
      structuredCall({
        system: TECH_EMIT_SYSTEM,
        user: `Repo: ${source.repoUrl}\n\nREPOSITORY DIGEST:\n\n${digest.text}`,
        schema: GatherFindingsSchema,
        toolName: "emit_findings",
        toolDescription:
          "Emit the technical findings (rich typed, with verbatim excerpts, quantities, entities, implication) as one structured object.",
      }),
    );

    // MIN_FACTS gate preserved: a thin reply looks sparse, so fall through to the fixture.
    if (findings.facts.length >= MIN_FACTS) {
      findings.kind = "technical";
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
