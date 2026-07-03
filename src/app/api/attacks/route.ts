import { NextResponse } from "next/server";
import type { Graph } from "@/engine";
import { generateAttacks } from "@/llm/client";
import { isScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  const { graph, pack, scenario } = (await req.json()) as {
    graph: Graph;
    pack?: DecisionContextPack;
    scenario?: unknown;
  };
  const attacks = await generateAttacks(
    graph,
    pack,
    isScenarioId(scenario) ? scenario : undefined,
  );
  return NextResponse.json({ attacks });
}
