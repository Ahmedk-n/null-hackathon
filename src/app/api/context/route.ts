import { NextResponse } from "next/server";
import { compileContext } from "@/context";
import type { ContextInput } from "@/context";

export async function POST(req: Request) {
  const input = (await req.json()) as ContextInput;
  const { companyContext, decisionContextPack } = await compileContext(input);
  // The stub always uses the fixture; the key presence is the correct live/fixture signal for now.
  const source = process.env.ANTHROPIC_API_KEY ? "live" : "fixture";
  return NextResponse.json({ companyContext, decisionContextPack, source });
}
