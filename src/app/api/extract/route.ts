import { NextResponse } from "next/server";
import { extractStructure } from "@/llm/client";
import type { DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  const { decision, pack } = (await req.json()) as {
    decision?: string;
    pack?: DecisionContextPack;
  };
  const graph = await extractStructure(decision ?? "", pack);
  return NextResponse.json(graph);
}
