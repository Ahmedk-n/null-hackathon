// P3-T6 · POST /api/council — server-side contextual analysis council.
//
// Mirrors src/app/api/decisions/calibration/route.ts's auth+never-500 shape: unauthed → 401
// (the CLIENT is responsible for falling back to fixtureCouncil for guests/offline — see the
// forthcoming src/lib/library/council-client.ts, Task 7). Body is parsed defensively
// (`.catch(() => null)` + a basic shape check) → 400 on a malformed payload. `runCouncil`
// itself never throws (src/agents/council/index.ts), but the whole handler is still wrapped in
// try/catch so nothing here can escape as an uncaught 500 / framework error page.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { runCouncil, type CouncilFinding } from "@/agents/council";
import { fixtureCouncil } from "@/agents/council/fixtures";
import type { Graph } from "@/engine";
import type { CompanyContext, DecisionContextPack } from "@/context";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
    // runCouncil never throws, so reaching here means something upstream (auth/parsing) failed
    // unexpectedly. Still never an uncaught 500: fall back to the hero fixture council.
    return NextResponse.json({ council: fixtureCouncil("A") });
  }
}
