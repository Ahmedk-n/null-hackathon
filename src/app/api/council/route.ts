// P3-T6/T7 · POST /api/council — server-side contextual analysis council.
//
// P3-T7: unlike src/app/api/decisions/calibration/route.ts (which is genuinely per-user scoped
// data, gated behind auth), this route reads NO user-scoped state — it only processes the posted
// graph/pack/company/findings through the pure `runCouncil` pipeline. That makes it exactly like
// /api/extract and /api/attacks (see those routes): guests can analyse today, so a guest POST
// here must get a real council back too (live if the server has a key, else `fixtureCouncil` via
// runCouncil's own internal fallback) — no hard 401. Body is still parsed defensively
// (`.catch(() => null)` + a basic shape check) → 400 on a malformed payload. `runCouncil` itself
// never throws (src/agents/council/index.ts), but the whole handler is still wrapped in
// try/catch so nothing here can escape as an uncaught 500 / framework error page.
import { NextResponse } from "next/server";
import { runCouncil, type CouncilFinding } from "@/agents/council";
import { fixtureCouncil } from "@/agents/council/fixtures";
import type { Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      graph?: unknown;
      pack?: unknown;
      company?: unknown;
      findings?: unknown;
    } | null;
    if (!body || !body.graph || !body.pack || !body.company) {
      return NextResponse.json({ error: "invalid council payload" }, { status: 400 });
    }

    const findings = Array.isArray(body.findings) ? (body.findings as CouncilFinding[]) : [];

    const council = await runCouncil({
      graph: body.graph as Graph,
      pack: body.pack as DecisionContextPack,
      company: body.company as CompanyContext,
      findings,
    });

    return NextResponse.json({ council });
  } catch {
    // runCouncil never throws, so reaching here means something upstream (request parsing / the
    // body-shape casts above) failed unexpectedly. Still never an uncaught 500: fall back to the
    // hero fixture council.
    return NextResponse.json({ council: fixtureCouncil("A") });
  }
}
