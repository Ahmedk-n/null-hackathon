// P2-T4 · GET /api/decisions/calibration — per-user cross-decision calibration.
//
// Mirrors src/app/api/decisions/route.ts's auth+RLS pattern: createServerSupabase() binds the
// request's session cookie, so the query below runs AS the authed user — RLS is the real
// ownership guard; the explicit .eq("user_id", user.id) is defense-in-depth. Unauthed → 401 (the
// CLIENT is responsible for falling back to fixtureOutcomes for guests — see
// src/lib/library/calibration.ts). Never a 500: any Supabase error or thrown exception is caught
// and returned as clean error JSON.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { fitCalibration, type ResolvedOutcome } from "@/engine/calibrate";
import type { DecisionRow } from "@/lib/supabase/types";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("decisions")
      .select("predicted_p_hold, outcome, materialized_categories")
      .eq("user_id", user.id)
      .not("outcome", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Pick<
      DecisionRow,
      "predicted_p_hold" | "outcome" | "materialized_categories"
    >[];

    const outcomes: ResolvedOutcome[] = rows
      .filter((row) => row.predicted_p_hold != null && row.outcome != null)
      .map((row) => ({
        predictedPHold: row.predicted_p_hold as number,
        outcome: row.outcome as "held" | "failed",
        materializedCategories: row.materialized_categories ?? undefined,
      }));

    return NextResponse.json({ calibration: fitCalibration(outcomes) });
  } catch {
    return NextResponse.json({ error: "failed to compute calibration" }, { status: 500 });
  }
}
