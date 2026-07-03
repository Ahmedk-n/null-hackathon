import { NextResponse } from "next/server";
import { compileContext } from "@/context";
import type { ContextInput } from "@/context";

export async function POST(req: Request) {
  const input = (await req.json()) as ContextInput;
  const { companyContext, decisionContextPack } = await compileContext(input);
  // compileContext (src/context/compile.ts) is a fixture-only stub that makes ZERO
  // Anthropic API calls, so the output is always cached fixture data regardless of key
  // presence. Reporting "live" here would be false advertising in the StatusStrip.
  // Report "fixture" until a real live compile lands; then gate the label on the actual
  // call outcome (compileContext should return its own source signal at that point).
  const source = "fixture" as const;
  return NextResponse.json({ companyContext, decisionContextPack, source });
}
