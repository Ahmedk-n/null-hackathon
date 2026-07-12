// Pure, boundary-clean. Learns a shrunk confidence-bias + category base rates from resolved decision
// outcomes, and recalibrates a probabilistic result. No Date/Math.random — deterministic.

export interface ResolvedOutcome {
  predictedPHold: number;              // 0..1 — the model's P(hold) at decision time
  outcome: "held" | "failed";
  materializedCategories?: string[];   // attack categories that actually came true
}

export interface Calibration {
  bias: number;                        // logit-space shift; <0 = you over-hold (optimism discounted)
  sampleCount: number;
  rawHoldRate: number;                 // observed fraction that held
  predictedMean: number;               // mean predicted pHold
  categoryRates: Record<string, number>; // shrunk materialization rate per category
}

export interface CalibratedResult {
  calibratedPHold: number;             // 0..1
  calibratedMean: number;              // 0..100
  calibratedBand: [number, number];    // 0..100
}

const EPS = 1e-6;
const PRIOR_STRENGTH = 4;              // pseudo-count pull toward identity (bias 0)

function logit(p: number): number {
  const c = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Bias-only Platt recalibration. Fit b minimizing logistic loss of σ(logit(p_i)+b) vs outcome
 * (convex 1-D → Newton), then shrink by n/(n+k) toward identity so few points can't overreact.
 */
export function fitCalibration(
  outcomes: ResolvedOutcome[],
  priorStrength: number = PRIOR_STRENGTH,
): Calibration {
  const n = outcomes.length;
  if (n === 0) {
    return { bias: 0, sampleCount: 0, rawHoldRate: 0, predictedMean: 0, categoryRates: {} };
  }
  const z = outcomes.map((o) => logit(o.predictedPHold));
  const y: number[] = outcomes.map((o) => (o.outcome === "held" ? 1 : 0));
  let b = 0;
  for (let iter = 0; iter < 25; iter++) {
    let g = 0;
    let h = 0;
    for (let i = 0; i < n; i++) {
      const s = sigmoid(z[i] + b);
      g += s - y[i];
      h += s * (1 - s);
    }
    if (h < EPS) break;
    const step = g / h;
    b -= step;
    if (Math.abs(step) < 1e-9) break;
  }
  const bias = b * (n / (n + priorStrength));
  const rawHoldRate = y.reduce((a, v) => a + v, 0) / n;
  const predictedMean = outcomes.reduce((a, o) => a + o.predictedPHold, 0) / n;

  const counts: Record<string, number> = {};
  for (const o of outcomes) for (const c of o.materializedCategories ?? []) counts[c] = (counts[c] ?? 0) + 1;
  const categoryRates: Record<string, number> = {};
  for (const c of Object.keys(counts)) {
    const rate = counts[c] / n;
    categoryRates[c] = (n * rate + priorStrength * 0.5) / (n + priorStrength); // shrink toward 0.5
  }
  return { bias, sampleCount: n, rawHoldRate, predictedMean, categoryRates };
}

/** Apply the calibration bias to a probabilistic result (logit-space shift of pHold + band). */
export function applyCalibration(
  result: { pHold: number; mean: number; band: [number, number] },
  cal: Calibration,
): CalibratedResult {
  const shift01 = (p01: number) => sigmoid(logit(p01) + cal.bias);
  return {
    calibratedPHold: shift01(result.pHold),
    calibratedMean: shift01(result.mean / 100) * 100,
    calibratedBand: [shift01(result.band[0] / 100) * 100, shift01(result.band[1] / 100) * 100],
  };
}
