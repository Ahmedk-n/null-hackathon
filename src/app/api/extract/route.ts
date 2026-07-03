import { NextResponse } from "next/server";
import { extractStructure } from "@/llm/client";

export async function POST(req: Request) {
  const { decision } = (await req.json()) as { decision?: string };
  const graph = await extractStructure(decision ?? "");
  return NextResponse.json(graph);
}
