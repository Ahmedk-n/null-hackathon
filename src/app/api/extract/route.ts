import { NextResponse } from "next/server";
import { extractStructure } from "@/llm/client";
import { isScenarioId } from "@/context";
import type { DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  const { decision, pack, scenario } = (await req.json()) as {
    decision?: string;
    pack?: DecisionContextPack;
    scenario?: unknown;
  };
  const graph = await extractStructure(
    decision ?? "",
    pack,
    isScenarioId(scenario) ? scenario : undefined,
  );
  return NextResponse.json(graph);
}
