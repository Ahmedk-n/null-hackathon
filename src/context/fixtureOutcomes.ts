// Phase 2 · cross-decision calibration (Task 4) — offline/guest demo driver.
//
// A hand-authored, DETERMINISTIC dataset (no Date/Math.random) standing in for a real user's
// resolved-decision history when there's no Supabase session to score against (guest mode) or
// when the calibration route is unreachable. It plays a SYSTEMATIC OVER-HOLDER: the model
// predicted a high P(hold) (0.7–0.85) on every one of these, yet roughly half actually failed —
// so `fitCalibration(fixtureOutcomes)` learns a clearly-negative bias (the engine should have
// discounted its own confidence) and non-trivial category rates for "execution"/"reliability",
// giving the offline demo something real to show.
//
// Client-reachable module: pure data, no imports beyond the engine type. NO @/lib/supabase/*,
// NO @/llm/*, NO Date/Math.random — see src/context/boundary.test.ts and src/store/boundary.test.ts.
import type { ResolvedOutcome } from "@/engine/calibrate";

export const fixtureOutcomes: ResolvedOutcome[] = [
  { predictedPHold: 0.82, outcome: "failed", materializedCategories: ["execution"] },
  { predictedPHold: 0.78, outcome: "held" },
  { predictedPHold: 0.75, outcome: "failed", materializedCategories: ["reliability"] },
  { predictedPHold: 0.8, outcome: "held" },
  { predictedPHold: 0.85, outcome: "failed", materializedCategories: ["execution"] },
  { predictedPHold: 0.72, outcome: "held" },
  { predictedPHold: 0.79, outcome: "failed" },
  { predictedPHold: 0.74, outcome: "failed", materializedCategories: ["reliability"] },
];
