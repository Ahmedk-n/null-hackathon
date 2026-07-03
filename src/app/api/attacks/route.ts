import { NextResponse } from "next/server";
import type { Graph } from "@/engine";
import { generateAttacks } from "@/llm/client";
import type { DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  const { graph, pack } = (await req.json()) as {
    graph: Graph;
    pack?: DecisionContextPack;
  };
  const attacks = await generateAttacks(graph, pack);
  return NextResponse.json({ attacks });
}
