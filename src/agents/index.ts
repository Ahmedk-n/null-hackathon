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

/** Dispatch to the matching agent. Each agent is offline-safe and never throws. */
export function gather(
  kind: GatherKind,
  source: GatherSource,
  emit: Emit,
  now: Now,
): Promise<GatherFindings> {
  switch (kind) {
    case "technical":
      return gatherTechnical(source as TechnicalSource, emit, now);
    case "business":
      return gatherBusiness(source as BusinessSource, emit, now);
    case "temporal":
      return gatherTemporal(source as TemporalSource, emit, now);
  }
}
