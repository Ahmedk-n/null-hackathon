import { NextResponse } from "next/server";
import { compileContext, isScenarioId } from "@/context";
import type { ContextInput, ContextFinding } from "@/context";

export async function POST(req: Request) {
  const body = (await req.json()) as ContextInput & {
    scenario?: unknown;
    findings?: ContextFinding[];
  };
  const scenario = isScenarioId(body.scenario) ? body.scenario : undefined;
  // V8-C1 · the client forwards the gathered multi-source research; compileContext grounds the
  // pack in it on the live path (a pinned scenario / no-key still short-circuits to fixtures, so
  // findings are inert there). Missing/empty findings → behaviour is exactly as before.
  const findings = Array.isArray(body.findings) ? body.findings : undefined;
  // compileContext (src/context/compile.ts) does the real Claude call when a key is present
  // and no scenario is pinned, and stamps `source` itself ("live" on a validated live answer,
  // "fixture" on the scenario short-circuit / no-key / any failure). The route forwards it
  // verbatim so the StatusStrip label reflects the actual call outcome.
  const { companyContext, decisionContextPack, source } = await compileContext(
    body,
    scenario,
    findings,
  );
  return NextResponse.json({ companyContext, decisionContextPack, source });
}
