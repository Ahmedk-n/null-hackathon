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
import { structuredCall, exploreWithTools } from "@/llm/structured";
import type { McpServerDef } from "@/lib/mcp/connector";

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
  - "source": a REAL, SPECIFIC repo path — a file (e.g. "pyproject.toml", ".github/workflows/ci.yml")
    or a named directory (e.g. "tests/") the fact actually came from. NEVER a blank string, NEVER a
    vague placeholder like "codebase" or "the repo" — if you cannot name the specific file/dir a fact
    rests on, drop the fact rather than emit an unsourced one.
  - "category": one of stack | infra | ci | tests | observability | team | tech-debt | integration.
  - "sourceExcerpt": a SHORT VERBATIM line/snippet from that file (or a grep hit) — real text from the digest.
  - "quantities": counts/versions as {metric,value,unit?} — e.g. {metric:"test files",value:"38"},
    {metric:"fastapi",value:"0.110"}, {metric:"services",value:"1"}, {metric:"total dependencies",value:"62"}.
  - "entities": named frameworks/libraries/tools (e.g. "FastAPI", "GitHub Actions", "pytest").
  - "implication": one sentence on why this matters for the founder's decision.
  - "confidence": 0..1.

Produce at least 7 facts (more if the digest supports it), kind "technical", spanning as many of the
categories above as the digest actually evidences — do not repeat the same category five times when
the digest has signal for CI, tests, observability, AND tech-debt. Prefer facts that carry a real
sourceExcerpt and quantities.`;

// MCP branch (P4.5 — real two-phase flow) — when the founder has a connected GitHub (or other
// repo-hosting) MCP server, prefer reading the REAL repo (files/issues/PRs/CI) through it over an
// anonymous shallow clone (which can't see private repos and only ever sees a file listing, never
// issue/PR history). PHASE 1 (below) is a genuine multi-turn exploration — via
// `exploreWithTools`, deliberately WITHOUT a forced tool_choice — so the model can actually call
// the connected MCP tools before answering; PHASE 2 is the existing forced emit_findings call
// (structuredCall), now fed the phase-1 research transcript instead of trying to explore AND
// emit in one forced-tool_choice call (which — the P4 bug — locks the model onto the emit tool
// and makes mcp_toolset uncallable in that same request).
const TECH_MCP_RESEARCH_SYSTEM = `You are Keystone's technical context agent. You have MCP tools connected (e.g. GitHub) for the
founder's actual repository. Use them to investigate thoroughly: read the README, manifests/lockfiles
(package.json, pyproject.toml, go.mod, etc.), key source files, CI config, open issues, and recent
PRs. Call as many tool uses as you need across your turns to build a real picture.

When you have genuinely investigated, STOP calling tools and write a THOROUGH technical synthesis in
prose: stack/framework, architecture (monolith vs services), infrastructure, deployment,
observability maturity, testing/CI, open issues/PRs relevant to the decision, and technical-debt
signals. For every claim, cite the EXACT file path or issue/PR id (e.g. "#142") you actually read,
plus a short verbatim excerpt. Do not fabricate — only state what you actually read via the tools.`;

const TECH_MCP_EMIT_SYSTEM = `You are Keystone's technical context agent. Below is the transcript of your investigation via
connected MCP tools (e.g. GitHub) — tool calls, tool results, and your synthesis. Convert it into
structured findings by calling the emit_findings tool. Use ONLY facts grounded in the transcript —
never invent files, versions, issues, or counts.

Determine the real technical context a founder would paste into a decision tool: stack/framework,
architecture (monolith vs services), infrastructure, deployment, observability maturity, testing/CI,
open issues/PRs relevant to the decision, and technical-debt signals.

For EACH fact populate the rich fields:
  - "label": short tag (e.g. "Framework", "CI", "Tests", "Observability", "Tech debt", "Open issue").
  - "value": a terse headline.
  - "source": a REAL, SPECIFIC repo file path, or an issue/PR reference (e.g. "#142"), from the
    transcript. NEVER a blank string or a vague placeholder — if you cannot name the specific
    file/issue/PR a fact rests on, drop the fact rather than emit an unsourced one.
  - "category": one of stack | infra | ci | tests | observability | team | tech-debt | integration.
  - "sourceExcerpt": a SHORT VERBATIM line/snippet from the transcript.
  - "quantities": counts/versions as {metric,value,unit?}.
  - "entities": named frameworks/libraries/tools.
  - "implication": one sentence on why this matters for the founder's decision.
  - "confidence": 0..1.

Produce at least 7 facts (more if the transcript supports it), kind "technical", spanning multiple
categories — files AND issues/PRs where available, not just one. Prefer facts that carry a real
sourceExcerpt.`;

/** MCP-connected read (no clone): PHASE 1 a genuine multi-turn exploration (`exploreWithTools`,
 *  unforced tool_choice) over the connected servers, PHASE 2 the forced emit_findings call over
 *  that research transcript. Returns null (never throws) on any failure or a too-thin reply, so
 *  the caller falls through to the shallow-clone path (if a repoUrl was given) or the fixture. */
async function gatherTechnicalViaMcp(
  source: TechnicalSource,
  emit: Emit,
  now: Now,
  mcpServers: McpServerDef[],
): Promise<GatherFindings | null> {
  try {
    // PHASE 1 — real exploration. The model can actually call the connected MCP tools (read
    // files, list issues/PRs, etc.) across turns because this call has no forced tool_choice.
    emit({ type: "status", message: "Investigating the repository via connected MCP tools (e.g. GitHub)…", ts: now() });
    const researchUser = source.repoUrl
      ? `Repo: ${source.repoUrl}\n\nInvestigate this repository via the connected MCP tools (README, manifests, key source files, CI config, open issues, recent PRs) before answering.`
      : "Investigate the connected repository via the connected MCP tools (README, manifests, key source files, CI config, open issues, recent PRs) before answering.";
    const transcript = await retryOnce(() =>
      exploreWithTools({
        system: TECH_MCP_RESEARCH_SYSTEM,
        user: researchUser,
        mcpServers,
      }),
    );

    // PHASE 2 — forced-tool finalizer over the research transcript. Separate call because a
    // forced tool_choice cannot coexist with genuine multi-turn tool exploration (see
    // exploreWithTools's doc comment in src/llm/structured.ts).
    emit({ type: "status", message: "Synthesizing technical findings (forced emit)…", ts: now() });
    const findings: GatherFindings = await retryOnce(() =>
      structuredCall({
        system: TECH_MCP_EMIT_SYSTEM,
        user: `Repo: ${source.repoUrl ?? "(connected via MCP)"}\n\nRESEARCH TRANSCRIPT:\n\n${transcript}`,
        schema: GatherFindingsSchema,
        toolName: "emit_findings",
        toolDescription:
          "Emit the technical findings (rich typed, grounded in real MCP-read repo content) as one structured object.",
      }),
    );
    return findings.facts.length >= MIN_FACTS ? findings : null;
  } catch {
    return null;
  }
}

export async function gatherTechnical(
  source: TechnicalSource,
  emit: Emit,
  now: Now,
  mcpServers?: McpServerDef[],
): Promise<GatherFindings> {
  const fallback = () => replayFixture("technical", emit, now);
  if (!hasApiKey()) return fallback();

  // Prefer a real MCP-connected read over the shallow clone whenever the founder has a
  // connected repo-hosting server (GitHub/etc). Falls through (clone, then fixture) on any
  // MCP-path failure or thin reply — never the sole path to a result.
  if (mcpServers && mcpServers.length > 0) {
    const mcpFindings = await gatherTechnicalViaMcp(source, emit, now, mcpServers);
    if (mcpFindings) {
      mcpFindings.kind = "technical";
      for (const f of mcpFindings.facts) emit({ type: "finding", finding: f, ts: now() });
      emit({ type: "done", findings: mcpFindings, source: "live", ts: now() });
      return mcpFindings;
    }
  }

  if (!source.repoUrl) return fallback();

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
