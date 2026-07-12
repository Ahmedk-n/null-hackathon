// P3-T7 · Client-side contextual analysis council fetch, mirroring calibration.ts's fetch-only /
// never-throw style.
//
// The council's real work (weighing/stress/skeptic seats, all LLM calls) happens server-side in
// POST /api/council (the server holds the key). This module is just the client-safe transport:
// POST the graph/pack/company/findings, hand back the parsed CouncilResult on success, or null on
// ANY failure (network error, non-OK response, unparseable body) — a null result means "no
// contextual overlay this run", never a thrown error. Client-reachable module: fetch only — NO
// @/lib/supabase/*, NO @/agents/* value import (type-only is fine), NO Date/Math.random — see
// src/store/boundary.test.ts.
import type { Attack, Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";
import type { CouncilResult } from "@/agents/council/types";

/** The plain, loose finding shape the route accepts — mirrors `CouncilFinding` structurally
 * (all fields optional) without a value import of `@/agents/council`. */
export interface CouncilClientFinding {
  source?: string;
  id?: string;
  label?: string;
  fact?: string;
}

export interface FetchCouncilInput {
  graph: Graph;
  pack: DecisionContextPack;
  company: CompanyContext;
  findings?: readonly CouncilClientFinding[];
}

/**
 * POSTs to /api/council and returns the server's `CouncilResult`, or null on any failure. Never
 * throws — a failed/omitted council is simply "no contextual overlay for this run" (the
 * deterministic keyword-reweight path in the store still runs unaffected).
 */
export async function fetchCouncil(input: FetchCouncilInput): Promise<CouncilResult | null> {
  try {
    const res = await fetch("/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph: input.graph,
        pack: input.pack,
        company: input.company,
        findings: input.findings ?? [],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { council?: CouncilResult } | null;
    return body?.council ?? null;
  } catch {
    return null;
  }
}
