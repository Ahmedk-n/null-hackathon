// P2-T4 · Client-side calibration fetch, mirroring remote.ts's fetch-only / never-throw style.
//
// Guest sessions have no server row to score against, so they get the offline fixture driver
// directly (no network round-trip) — flagged `isSample: true` so the UI never presents it as the
// caller's own track record. Signed-in sessions hit the RLS-scoped calibration route: an OK
// response is the caller's REAL record (even an empty one, sampleCount 0 — that's still honestly
// theirs, not a stand-in), so it is always `isSample: false`. Only a failure to reach the route at
// all (network error, non-OK response, unparseable body) falls back — to an EMPTY real record
// (`fitCalibration([])`), never to the fixture: a signed-in user must never be shown a fabricated
// personal bias. Client-reachable module: only @/engine/calibrate + @/context/fixtureOutcomes +
// fetch — NO @/lib/supabase/*, NO @/llm/*, NO Date/Math.random — see src/context/boundary.test.ts
// and src/store/boundary.test.ts.
import { fitCalibration, type Calibration } from "@/engine/calibrate";
import { fixtureOutcomes } from "@/context/fixtureOutcomes";

export interface CalibrationResult {
  calibration: Calibration;
  // true only for the guest/offline fixture — a demo/illustrative sample, never the signed-in
  // caller's real record (even an empty real record is `isSample: false`).
  isSample: boolean;
}

const fixtureCalibration = (): Calibration => fitCalibration(fixtureOutcomes);
const emptyCalibration = (): Calibration => fitCalibration([]);

export async function fetchCalibration(isGuest: boolean): Promise<CalibrationResult> {
  if (isGuest) return { calibration: fixtureCalibration(), isSample: true };

  try {
    const res = await fetch("/api/decisions/calibration");
    if (!res.ok) return { calibration: emptyCalibration(), isSample: false };
    const body = (await res.json().catch(() => null)) as { calibration?: Calibration } | null;
    const calibration = body?.calibration;
    // A real, empty record (sampleCount 0) is still the caller's own — never substitute the
    // fixture for a signed-in user, however sparse their history is.
    if (!calibration) return { calibration: emptyCalibration(), isSample: false };
    return { calibration, isSample: false };
  } catch {
    // offline / network failure — an honest empty record, NOT the fixture (this is a signed-in
    // session; the fixture would be a fabricated personal bias).
    return { calibration: emptyCalibration(), isSample: false };
  }
}
