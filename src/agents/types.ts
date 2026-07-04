// Agentic context aggregation — data contracts (redesign plan §3.2).
// Server-only module. `ts` fields are ALWAYS supplied by the caller (the route);
// never generate `Date.now()` / `new Date()` inside this module or any agent module.

export type GatherKind = "technical" | "business" | "temporal";

/** One quantified data point pulled from a source (V8-C2). `value` is a string so
 *  versions ("4.7.2"), money ("$17.5B"), and counts ("42") share one shape. */
export interface Quantity {
  metric: string;
  value: string;
  unit?: string;
}

/**
 * One discovered fact. `source` is provenance (a file path, a url, or "notes").
 *
 * V8-C2 · RICH TYPED FINDING. `label`/`value`/`source` stay REQUIRED (back-compat); the
 * rest are optional so a thin reply still parses, but every agent's forced-tool prompt asks
 * for them, so a live reply populates them. This is what makes a finding read as multi-layered
 * research (a verbatim quote + extracted numbers + named entities + why it matters) instead of
 * a flat headline.
 */
export interface GatherFinding {
  label: string;
  value: string;
  source: string;
  /** Coarse bucket for the finding (e.g. "stack", "infra", "competitor", "deadline"). */
  category?: string;
  /** A VERBATIM quote lifted from the source — the actual line/snippet the fact rests on. */
  sourceExcerpt?: string;
  /** Numbers extracted as DATA: counts, versions, money, headcounts (metric/value/unit). */
  quantities?: Quantity[];
  /** Named things: frameworks, libraries, competitors, people, orgs, certs. */
  entities?: string[];
  /** An ISO date when the source states one (else omitted; NEVER synthesised client-side). */
  dateISO?: string;
  /** The agent's confidence in the fact, 0..1. */
  confidence?: number;
  /** Why this fact matters for the decision — the "so what" tied to the call being made. */
  implication?: string;
  /**
   * @deprecated V7-4 legacy fields, superseded by the rich fields above (V8-C2). Kept optional
   * for back-compat with the extraction mapping in KeystoneApp (C3 migrates it to sourceExcerpt);
   * agents no longer prompt for these. Do not add new consumers.
   */
  detail?: string;
  /** @deprecated see `detail` — superseded by `quantities`/`entities`. */
  specifics?: string[];
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
