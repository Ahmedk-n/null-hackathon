import { NextResponse } from "next/server";
import { compileContext, isScenarioId } from "@/context";
import type { ContextInput } from "@/context";

export async function POST(req: Request) {
  const body = (await req.json()) as ContextInput & { scenario?: unknown };
  const scenario = isScenarioId(body.scenario) ? body.scenario : undefined;
  // compileContext (src/context/compile.ts) does the real Claude call when a key is present
  // and no scenario is pinned, and stamps `source` itself ("live" on a validated live answer,
  // "fixture" on the scenario short-circuit / no-key / any failure). The route forwards it
  // verbatim so the StatusStrip label reflects the actual call outcome.
  const { companyContext, decisionContextPack, source } = await compileContext(body, scenario);
  return NextResponse.json({ companyContext, decisionContextPack, source });
}
