// Agentic context aggregation — data contracts (redesign plan §3.2).
// Server-only module. `ts` fields are ALWAYS supplied by the caller (the route);
// never generate `Date.now()` / `new Date()` inside this module or any agent module.

export type GatherKind = "technical" | "business" | "temporal";

/** One discovered fact. `source` is provenance (a file path, a url, or "notes"/"web"). */
export interface GatherFinding {
  label: string;
  value: string;
  source: string;
}

export interface GatherFindings {
  kind: GatherKind;
  /** Pre-fills the manual textarea → flows into ContextInput. */
  summary: string;
  /** Rendered in the FINDINGS ledger. */
  facts: GatherFinding[];
  /** Optional structured extras. */
  raw?: Record<string, unknown>;
}

export type AgentEvent =
  | { type: "status"; message: string; ts: string }
  | { type: "finding"; finding: GatherFinding; ts: string }
  | { type: "error"; message: string; ts: string }
  | { type: "done"; findings: GatherFindings; source: "live" | "fixture"; ts: string };

export interface TechnicalSource {
  repoUrl?: string;
  branch?: string;
  notes?: string;
}

export interface BusinessSource {
  website?: string;
  competitors?: string[];
  notes?: string;
}

export interface TemporalSource {
  notes: string;
}

export type GatherSource = TechnicalSource | BusinessSource | TemporalSource;

/** Callback the agents use to stream progress; the route wires it to the SSE stream. */
export type Emit = (e: AgentEvent) => void;

/** Timestamp supplier — the route passes `() => new Date().toISOString()`. */
export type Now = () => string;
