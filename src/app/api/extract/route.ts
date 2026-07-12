import { NextResponse } from "next/server";
import { extractStructureWithSource, generateDrivers } from "@/llm/client";
import type { ExtractFinding } from "@/llm/client";
import { isScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  const { decision, pack, scenario, findings } = (await req.json()) as {
    decision?: string;
    pack?: DecisionContextPack;
    scenario?: unknown;
    // V3-6: optional gathered findings so live extraction can ground confidences in evidence.
    // Additive; existing callers that omit it get the same behaviour as before.
    findings?: ExtractFinding[];
  };
  // Body stays the bare graph (byte-identical to before). Provenance rides ADDITIVELY on a header
  // so the client can tell a live extraction from a fixture fallback without any body-shape change.
  const { graph, source } = await extractStructureWithSource(
    decision ?? "",
    pack,
    isScenarioId(scenario) ? scenario : undefined,
    Array.isArray(findings) ? findings : undefined,
  );
  // PROBABILISTIC (Task 6, secondary): custom/live extractions have no fixture-authored
  // `drivers`, so the Monte-Carlo layer would otherwise sample every assumption independently.
  // Only for a genuinely LIVE extraction (never a scenario/fixture fallback — those already
  // carry hand-authored drivers from Task 5) infer latent common-mode drivers server-side,
  // where the API key actually lives. `generateDrivers` never throws and returns `[]` with no
  // key / on any error, so this is a strictly non-blocking, additive best-effort attach.
  if (source === "live") {
    const drivers = await generateDrivers(graph);
    if (drivers.length > 0) graph.drivers = drivers;
  }
  return NextResponse.json(graph, { headers: { "x-keystone-source": source } });
}
