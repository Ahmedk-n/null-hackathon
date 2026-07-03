import { NextResponse } from "next/server";
import type { Graph } from "@/engine";
import { generateAttacks } from "@/llm/client";

export async function POST(req: Request) {
  const { graph } = (await req.json()) as { graph: Graph };
  const attacks = await generateAttacks(graph);
  return NextResponse.json({ attacks });
}
