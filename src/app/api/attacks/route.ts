import { NextResponse } from "next/server";
import type { Graph } from "@/engine";
import { generateAttacksWithSource } from "@/llm/client";
import { isScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  const { graph, pack, scenario } = (await req.json()) as {
    graph: Graph;
    pack?: DecisionContextPack;
    scenario?: unknown;
  };
  // Body stays {attacks} (byte-identical to before). Provenance rides ADDITIVELY on a header so the
  // client can tell a live attack-gen from a fixture fallback without any body-shape change.
  const { attacks, source } = await generateAttacksWithSource(
    graph,
    pack,
    isScenarioId(scenario) ? scenario : undefined,
  );
  return NextResponse.json({ attacks }, { headers: { "x-keystone-source": source } });
}
