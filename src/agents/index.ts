// Barrel + dispatcher for the agentic context aggregation module (server-only).
export * from "./types";
export * from "./schemas";
export * from "./fixtures";
export { gatherTechnical } from "./technical";
export { gatherBusiness } from "./business";
export { gatherTemporal } from "./temporal";

import type {
  BusinessSource,
  Emit,
  GatherFindings,
  GatherKind,
  GatherSource,
  Now,
  TechnicalSource,
  TemporalSource,
} from "./types";
import { gatherTechnical } from "./technical";
import { gatherBusiness } from "./business";
import { gatherTemporal } from "./temporal";
import type { McpServerDef } from "@/lib/mcp/connector";

/**
 * Dispatch to the matching agent. Each agent is offline-safe and never throws.
 * `mcpServers` (plan Task 11) is the signed-in caller's connected MCP servers, built by
 * `buildMcpServers` in the route from their `connections` rows; guests/omitted → unchanged.
 */
export function gather(
  kind: GatherKind,
  source: GatherSource,
  emit: Emit,
  now: Now,
  mcpServers?: McpServerDef[],
): Promise<GatherFindings> {
  switch (kind) {
    case "technical":
      return gatherTechnical(source as TechnicalSource, emit, now, mcpServers);
    case "business":
      return gatherBusiness(source as BusinessSource, emit, now, mcpServers);
    case "temporal":
      return gatherTemporal(source as TemporalSource, emit, now, mcpServers);
  }
}
