// Unit tests for gatherTechnical's three paths (P4.5), owned alongside src/agents/technical.ts:
//  (a) no key -> unchanged fixture path, never throws.
//  (b) key + a stub mcpServers, with structuredCall/exploreWithTools mocked -> the real two-phase
//      flow runs: PHASE 1 (exploreWithTools, unforced research) happens BEFORE PHASE 2 (the
//      forced emit_findings call), and the result is schema-valid with non-empty `source`.
//  (c) key present but NO mcpServers -> the shallow-clone digest path runs (child_process + fs
//      mocked so no real git/network), NOT the MCP path (exploreWithTools is never called).
//
// The "@/llm/structured" seam is mocked wholesale (not the raw SDK) so phase 1 vs phase 2 call
// order can be asserted directly, mirroring src/agents/gather.test.ts's approach of mocking the
// structuredCall seam for the MCP branch. Case (c) additionally mocks node:child_process /
// node:fs/promises so the shallow-clone path never touches a real repo or network.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentEvent } from "./types";
import type { GatherFindings } from "./types";

const { structuredCallMock, exploreWithToolsMock } = vi.hoisted(() => ({
  structuredCallMock: vi.fn(),
  exploreWithToolsMock: vi.fn(),
}));
vi.mock("@/llm/structured", () => ({
  structuredCall: structuredCallMock,
  exploreWithTools: exploreWithToolsMock,
}));

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => cb(null, { stdout: "", stderr: "" }),
  ),
}));
vi.mock("node:child_process", () => ({ exec: execMock }));

const FAKE_ROOT = "/tmp/keystone-repo-test";
const { mkdtempMock, rmMock, readdirMock, readFileMock } = vi.hoisted(() => ({
  mkdtempMock: vi.fn(async () => FAKE_ROOT),
  rmMock: vi.fn(async () => undefined),
  readdirMock: vi.fn(async (dir: string) => {
    if (dir === FAKE_ROOT) {
      return [
        { name: "package.json", isDirectory: () => false, isFile: () => true },
        { name: "README.md", isDirectory: () => false, isFile: () => true },
      ];
    }
    return [];
  }),
  readFileMock: vi.fn(async (filePath: string) => {
    if (filePath.endsWith("package.json")) {
      return JSON.stringify({ name: "acme-api", dependencies: { fastify: "4.0.0" } });
    }
    if (filePath.endsWith("README.md")) return "# Acme API\n\nA test repo.";
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }),
}));
vi.mock("node:fs/promises", () => ({
  mkdtemp: mkdtempMock,
  rm: rmMock,
  readdir: readdirMock,
  readFile: readFileMock,
}));

import { gatherTechnical } from "./technical";
import { GatherFindingsSchema } from "./schemas";

const FIXED_TS = "2026-07-07T00:00:00Z";
const STUB_MCP_SERVERS = [
  { type: "url" as const, name: "github", url: "https://api.githubcopilot.com/mcp/", authorization_token: "ghp_x" },
];

function stubFindings(sourcePrefix: string): GatherFindings {
  return {
    kind: "technical",
    summary: "technical summary",
    facts: Array.from({ length: 5 }, (_, i) => ({
      label: `Fact ${i}`,
      value: `Value ${i}`,
      source: `${sourcePrefix}${i}`,
    })),
  };
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  structuredCallMock.mockReset();
  exploreWithToolsMock.mockReset();
  execMock.mockClear();
  mkdtempMock.mockClear();
  rmMock.mockClear();
  readdirMock.mockClear();
  readFileMock.mockClear();
});

describe("gatherTechnical (a): no key -> unchanged fixture path, never throws", () => {
  it("returns schema-valid fixture findings and never touches structuredCall/exploreWithTools/clone", async () => {
    const events: AgentEvent[] = [];
    const findings = await gatherTechnical({ repoUrl: "https://github.com/acme/api" }, (e) => events.push(e), () => FIXED_TS);

    expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
    expect(findings.kind).toBe("technical");
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("fixture");

    expect(structuredCallMock).not.toHaveBeenCalled();
    expect(exploreWithToolsMock).not.toHaveBeenCalled();
    expect(execMock).not.toHaveBeenCalled();
  });

  it("no repoUrl, no mcpServers -> still the fixture path, never throws", async () => {
    const events: AgentEvent[] = [];
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const findings = await gatherTechnical({}, (e) => events.push(e), () => FIXED_TS);
    expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
    const last = events[events.length - 1];
    if (last.type === "done") expect(last.source).toBe("fixture");
    expect(structuredCallMock).not.toHaveBeenCalled();
    expect(exploreWithToolsMock).not.toHaveBeenCalled();
  });
});

describe("gatherTechnical (b): key + stub mcpServers -> the real two-phase MCP flow", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });

  it("runs exploreWithTools (phase 1) THEN structuredCall (phase 2), returns schema-valid findings with non-empty source, never touches the clone path", async () => {
    exploreWithToolsMock.mockResolvedValue("Research transcript: read README.md, found FastAPI in package.json, issue #12 open.");
    structuredCallMock.mockResolvedValue(stubFindings("src/file"));

    const events: AgentEvent[] = [];
    const findings = await gatherTechnical(
      { repoUrl: "https://github.com/acme/api" },
      (e) => events.push(e),
      () => FIXED_TS,
      STUB_MCP_SERVERS,
    );

    // Phase 1 happened, with the connected servers attached.
    expect(exploreWithToolsMock).toHaveBeenCalledTimes(1);
    expect(exploreWithToolsMock.mock.calls[0][0]).toMatchObject({ mcpServers: STUB_MCP_SERVERS });

    // Phase 2 happened AFTER phase 1 (call-order invocation index), fed the phase-1 transcript.
    expect(structuredCallMock).toHaveBeenCalledTimes(1);
    const exploreOrder = exploreWithToolsMock.mock.invocationCallOrder[0];
    const emitOrder = structuredCallMock.mock.invocationCallOrder[0];
    expect(exploreOrder).toBeLessThan(emitOrder);
    expect(structuredCallMock.mock.calls[0][0].user).toContain("issue #12 open");

    // Schema-valid, every fact has a non-empty source, never touched the shallow clone.
    expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
    for (const f of findings.facts) expect(f.source.length).toBeGreaterThan(0);
    expect(execMock).not.toHaveBeenCalled();

    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("live");
  });

  it("MCP branch failing (thin reply) falls through to the shallow-clone path (or fixture), never throws", async () => {
    exploreWithToolsMock.mockResolvedValue("thin transcript");
    structuredCallMock.mockResolvedValue({ kind: "technical", summary: "thin", facts: [] });

    const events: AgentEvent[] = [];
    const findings = await gatherTechnical({}, (e) => events.push(e), () => FIXED_TS, STUB_MCP_SERVERS);

    expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("fixture");
  });
});

describe("gatherTechnical (c): key present but NO mcpServers -> the shallow-clone path, not the MCP path", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });

  it("clones (mocked) and builds the digest, never calling exploreWithTools", async () => {
    structuredCallMock.mockResolvedValue(stubFindings("digest-source-"));

    const events: AgentEvent[] = [];
    const findings = await gatherTechnical({ repoUrl: "https://github.com/acme/api" }, (e) => events.push(e), () => FIXED_TS);

    // The MCP research helper was never invoked — this is the shallow-clone path.
    expect(exploreWithToolsMock).not.toHaveBeenCalled();
    // The (mocked) clone + digest build ran.
    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock.mock.calls[0][0]).toContain("git clone");
    expect(mkdtempMock).toHaveBeenCalledTimes(1);
    expect(readdirMock).toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledTimes(1); // temp dir cleaned up

    // The single forced emit call (structuredCall) ran over the digest.
    expect(structuredCallMock).toHaveBeenCalledTimes(1);
    expect(structuredCallMock.mock.calls[0][0].user).toContain("REPOSITORY DIGEST");

    expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("live");
  });

  it("mcpServers explicitly empty array -> also the shallow-clone path", async () => {
    structuredCallMock.mockResolvedValue(stubFindings("digest-source-"));
    const findings = await gatherTechnical({ repoUrl: "https://github.com/acme/api" }, () => {}, () => FIXED_TS, []);
    expect(exploreWithToolsMock).not.toHaveBeenCalled();
    expect(execMock).toHaveBeenCalledTimes(1);
    expect(() => GatherFindingsSchema.parse(findings)).not.toThrow();
  });
});
