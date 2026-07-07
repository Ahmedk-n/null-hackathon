// Preset connection kinds (plan Task 8): URL + secret-field label per kind. Pure
// data — client-safe (no secrets, no server-only imports) — consumed by both the
// /api/connections routes (defaulting url/name on create) and ConnectionsPanel
// (rendering the "add connection" picker).
import type { ConnectionKind } from "@/lib/supabase/types";

export interface ConnectionKindPreset {
  label: string;
  // Default MCP server URL for this kind. Empty string means "user must supply one"
  // (custom/calendar have no fixed hosted endpoint).
  url: string;
  secretLabel: string;
}

export const CONNECTION_KINDS: Record<ConnectionKind, ConnectionKindPreset> = {
  github: {
    label: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    secretLabel: "GitHub token (PAT)",
  },
  linear: {
    label: "Linear",
    url: "https://mcp.linear.app/mcp",
    secretLabel: "Linear API key",
  },
  notion: {
    label: "Notion",
    url: "https://mcp.notion.com/mcp",
    secretLabel: "Notion OAuth token",
  },
  jira: {
    label: "Jira",
    url: "https://mcp.atlassian.com/v1/sse",
    secretLabel: "Atlassian API token",
  },
  calendar: {
    label: "Calendar",
    url: "",
    secretLabel: "Bearer token (optional)",
  },
  custom: {
    label: "Custom",
    url: "",
    secretLabel: "Bearer token (optional)",
  },
};

// Stable display order for the "add connection" kind picker.
export const CONNECTION_KIND_ORDER: ConnectionKind[] = [
  "github",
  "linear",
  "notion",
  "jira",
  "calendar",
  "custom",
];

export function isConnectionKind(value: unknown): value is ConnectionKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CONNECTION_KINDS, value);
}
