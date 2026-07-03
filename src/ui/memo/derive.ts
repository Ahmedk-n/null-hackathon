// V5-2 · Pure derivations for the decision memo sheet. Data-in / data-out, no React,
// no wall-clock, no randomness — safe to bundle client-side and unit-testable.
import type { GraphNode } from "@/engine";

// Verdict status word from the domain model: INTEGRITY (thesis support ×100) bands into
// HOLDING ≥35 / STRESSED 10–35 / FAILED <10.
export type StatusWord = "HOLDING" | "STRESSED" | "FAILED";

export function statusWord(integrity: number): StatusWord {
  if (integrity >= 35) return "HOLDING";
  if (integrity >= 10) return "STRESSED";
  return "FAILED";
}

// Design-system accent token per status word.
export function statusAccent(word: StatusWord): string {
  return word === "HOLDING" ? "var(--ok)" : word === "STRESSED" ? "var(--warn)" : "var(--bad)";
}

// Provenance state of an assumption (domain model): GROUNDED (has evidence) /
// UNGROUNDED — ASSUMED (evidence null) / MODIFIED — UNVERIFIED (human-edited). The engine
// GraphNode type carries `evidence` today; `provenance` is added by graph-editing (V5-3).
// We read it defensively so the register lights up MODIFIED the moment the field exists.
export type ProvenanceState = "GROUNDED" | "UNGROUNDED" | "MODIFIED";

export interface ProvenanceReading {
  state: ProvenanceState;
  /** Human-facing register phrase. */
  phrase: string;
  /** Cited fact + source, only when GROUNDED. */
  fact?: string;
  source?: string;
}

export function provenanceOf(node: GraphNode): ProvenanceReading {
  const provenance = (node as { provenance?: string }).provenance;
  if (provenance === "modified") {
    return { state: "MODIFIED", phrase: "MODIFIED — UNVERIFIED" };
  }
  if (node.evidence) {
    return {
      state: "GROUNDED",
      phrase: "GROUNDED",
      fact: node.evidence.fact,
      source: node.evidence.source,
    };
  }
  return { state: "UNGROUNDED", phrase: "UNGROUNDED — ASSUMED" };
}

export function provenanceAccent(state: ProvenanceState): string {
  return state === "GROUNDED" ? "var(--ok)" : state === "MODIFIED" ? "var(--warn)" : "var(--muted)";
}
