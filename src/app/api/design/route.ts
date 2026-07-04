import { NextResponse } from "next/server";
import { designCandidates } from "@/llm/design";
import { isScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";

// V6-1 · POST /api/design {goal, constraints, pack?, scenario?} → {candidates:[{lens,label,graph,
// attacks,source}]} + an x-keystone-source header (overall provenance). designCandidates NEVER
// throws and NEVER returns fewer than 3 candidates, so this route can never 500.
export async function POST(req: Request) {
  const { goal, constraints, pack, scenario } = (await req.json()) as {
    goal?: string;
    constraints?: string;
    pack?: DecisionContextPack;
    scenario?: unknown;
  };
  const { candidates, source } = await designCandidates(
    goal ?? "",
    constraints ?? "",
    pack,
    isScenarioId(scenario) ? scenario : undefined,
  );
  return NextResponse.json({ candidates }, { headers: { "x-keystone-source": source } });
}
