import { NextResponse } from "next/server";
import { extractStructureWithSource } from "@/llm/client";
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
  return NextResponse.json(graph, { headers: { "x-keystone-source": source } });
}
