import { describe, it, expect } from "vitest";
import { buildMcpServers, toolsetFor } from "./connector";
import type { ConnectionRow } from "@/lib/supabase/types";

function row(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: "c-1",
    user_id: "u-1",
    kind: "custom",
    name: "My connection",
    url: "https://example.com/mcp",
    secret: null,
    status: "untested",
    last_used_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildMcpServers", () => {
  it("maps a github row with a secret to a url def with authorization_token", () => {
    const rows = [
      row({ id: "c-gh", kind: "github", name: "GitHub", url: "https://api.githubcopilot.com/mcp/", secret: "ghp_abc123" }),
    ];
    const defs = buildMcpServers(rows);
    expect(defs).toEqual([
      { type: "url", name: "github", url: "https://api.githubcopilot.com/mcp/", authorization_token: "ghp_abc123" },
    ]);
  });

  it("omits authorization_token entirely when secret is null", () => {
    const rows = [row({ id: "c-custom", kind: "custom", name: "Custom Server", url: "https://example.com/mcp", secret: null })];
    const defs = buildMcpServers(rows);
    expect(defs).toHaveLength(1);
    expect(defs[0]).not.toHaveProperty("authorization_token");
    expect(defs[0]).toEqual({ type: "url", name: "custom-server", url: "https://example.com/mcp" });
  });

  it("omits authorization_token when secret is a blank/whitespace string", () => {
    const rows = [row({ name: "Blank Secret", url: "https://example.com/mcp", secret: "   " })];
    const defs = buildMcpServers(rows);
    expect(defs[0]).not.toHaveProperty("authorization_token");
  });

  it("drops rows with an empty or blank url", () => {
    const rows = [
      row({ id: "c-empty", name: "Empty URL", url: "" }),
      row({ id: "c-blank", name: "Blank URL", url: "   " }),
      row({ id: "c-ok", name: "OK", url: "https://example.com/mcp" }),
    ];
    const defs = buildMcpServers(rows);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("ok");
  });

  it("handles the full mixed set from the plan: github+secret, custom+no-secret, empty-url", () => {
    const rows = [
      row({ id: "c1", kind: "github", name: "GitHub", url: "https://api.githubcopilot.com/mcp/", secret: "ghp_xyz" }),
      row({ id: "c2", kind: "custom", name: "Internal Tool", url: "https://tools.example.com/mcp", secret: null }),
      row({ id: "c3", kind: "custom", name: "Disabled", url: "" }),
    ];
    const defs = buildMcpServers(rows);
    expect(defs).toHaveLength(2);
    expect(defs[0]).toEqual({
      type: "url",
      name: "github",
      url: "https://api.githubcopilot.com/mcp/",
      authorization_token: "ghp_xyz",
    });
    expect(defs[1]).toEqual({ type: "url", name: "internal-tool", url: "https://tools.example.com/mcp" });
  });

  it("returns an empty array for no rows", () => {
    expect(buildMcpServers([])).toEqual([]);
  });

  it("slugifies punctuation/case and de-duplicates colliding slugs", () => {
    const rows = [
      row({ id: "c1", name: "My GitHub!!", url: "https://a.example.com/mcp" }),
      row({ id: "c2", name: "My_GitHub", url: "https://b.example.com/mcp" }),
    ];
    const defs = buildMcpServers(rows);
    expect(defs[0].name).toBe("my-github");
    expect(defs[1].name).toBe("my-github-2");
  });

  it("trims a whitespace-padded url", () => {
    const rows = [row({ name: "Padded", url: "  https://example.com/mcp  " })];
    const defs = buildMcpServers(rows);
    expect(defs[0].url).toBe("https://example.com/mcp");
  });
});

describe("toolsetFor", () => {
  it("mirrors server def names into mcp_toolset tools", () => {
    const defs = buildMcpServers([
      row({ id: "c1", name: "GitHub", url: "https://api.githubcopilot.com/mcp/" }),
      row({ id: "c2", name: "Linear", url: "https://mcp.linear.app/mcp" }),
    ]);
    expect(toolsetFor(defs)).toEqual([
      { type: "mcp_toolset", mcp_server_name: "github" },
      { type: "mcp_toolset", mcp_server_name: "linear" },
    ]);
  });

  it("returns an empty array for no defs", () => {
    expect(toolsetFor([])).toEqual([]);
  });
});
