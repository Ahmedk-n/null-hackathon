// P2-T4 · Client-side calibration fetch, mirroring remote.ts's fetch-only / never-throw style.
//
// Guest sessions have no server row to score against, so they get the offline fixture driver
// directly (no network round-trip). Signed-in sessions hit the RLS-scoped calibration route; any
// failure to reach it (network error, non-OK response, or an empty/zero-sample result) falls back
// to the same fixture so the demo always has something to show. Client-reachable module: only
// @/engine/calibrate + @/context/fixtureOutcomes + fetch — NO @/lib/supabase/*, NO @/llm/*, NO
// Date/Math.random — see src/context/boundary.test.ts and src/store/boundary.test.ts.
import { fitCalibration, type Calibration } from "@/engine/calibrate";
import { fixtureOutcomes } from "@/context/fixtureOutcomes";

const fixtureCalibration = (): Calibration => fitCalibration(fixtureOutcomes);

export async function fetchCalibration(isGuest: boolean): Promise<Calibration> {
  if (isGuest) return fixtureCalibration();

  try {
    const res = await fetch("/api/decisions/calibration");
    if (!res.ok) return fixtureCalibration();
    const body = (await res.json().catch(() => null)) as { calibration?: Calibration } | null;
    const calibration = body?.calibration;
    if (!calibration || calibration.sampleCount === 0) return fixtureCalibration();
    return calibration;
  } catch {
    return fixtureCalibration(); // offline / network failure — the demo still shows the mechanism
  }
}
