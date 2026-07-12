// Pure, seeded Monte-Carlo over the FROZEN engine. Samples assumption confidences from a
// logit-normal factor model: marginal spread from evidenceStrength, correlation from Driver
// loadings. Calls computeSupport N times; aggregates integrity into a distribution.
// Engine math is untouched — this only READS computeSupport.
import type { Graph, GraphNode, Driver, EvidenceStrength, ProbabilisticResult } from "./types";
import { computeSupport, FAILURE_THRESHOLD, clamp01 } from "./propagation";
import { makeRng, hashSeed, normal } from "./rng";

export const SPREAD_BY_STRENGTH: Record<EvidenceStrength, number> = {
  strong: 0.35,
  moderate: 0.8,
  weak: 1.5,
};

const DEFAULT_SAMPLES = 2000;

function logit(p: number): number {
  const c = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function seedString(graph: Graph): string {
  const nodes = graph.nodes.map((n) => `${n.id}:${n.confidence}:${n.evidenceStrength ?? "-"}`).join(",");
  const drivers = (graph.drivers ?? [])
    .map((d) => `${d.id}[${d.loadings.map((l) => `${l.assumptionId}=${l.loading}`).join("|")}]`)
    .join(",");
  return `${graph.thesisId}#${nodes}#${drivers}`;
}

interface Prepared {
  assumptions: { id: string; m: number; s: number; loadings: number[]; comm: number }[];
  drivers: Driver[];
}

function prepare(graph: Graph): Prepared {
  const drivers = graph.drivers ?? [];
  const assumptions = graph.nodes
    .filter((n) => n.type === "assumption")
    .map((n: GraphNode) => {
      const loadings = drivers.map((d) => {
        const hit = d.loadings.find((l) => l.assumptionId === n.id);
        return hit ? clamp01(hit.loading) : 0;
      });
      const sumSq = loadings.reduce((acc, l) => acc + l * l, 0);
      const comm = Math.min(1, sumSq); // communality ≤ 1
      return {
        id: n.id,
        m: logit(clamp01(n.confidence)),
        s: SPREAD_BY_STRENGTH[n.evidenceStrength ?? "moderate"],
        loadings,
        comm,
      };
    });
  return { assumptions, drivers };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp01(q) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Per-sample record kept for aggregation + sensitivity (Task 3). */
export interface SampleTrace {
  integrities: number[];        // length N, 0..100
  holds: number;                // count of samples above threshold
  z: number[][];                // [N][driverCount] shared factor draws
  conf: Record<string, number[]>; // assumptionId → length-N sampled confidence
}

export function sampleRun(graph: Graph, samples: number, seed: number): { prep: Prepared; trace: SampleTrace } {
  const prep = prepare(graph);
  const rng = makeRng(seed);
  const clone: Graph = { ...graph, nodes: graph.nodes.map((n) => ({ ...n })) };
  const nodeById = new Map(clone.nodes.map((n) => [n.id, n]));

  const integrities: number[] = new Array(samples);
  const z: number[][] = new Array(samples);
  const conf: Record<string, number[]> = {};
  for (const a of prep.assumptions) conf[a.id] = new Array(samples);
  let holds = 0;

  for (let s = 0; s < samples; s++) {
    const zRow = prep.drivers.map(() => normal(rng));
    z[s] = zRow;
    for (const a of prep.assumptions) {
      let shared = 0;
      for (let d = 0; d < zRow.length; d++) shared += a.loadings[d] * zRow[d];
      const eps = normal(rng);
      const x = shared + Math.sqrt(Math.max(0, 1 - a.comm)) * eps;
      const c = sigmoid(a.m + a.s * x);
      conf[a.id][s] = c;
      nodeById.get(a.id)!.confidence = c;
    }
    const support = computeSupport(clone).get(clone.thesisId) ?? 0;
    integrities[s] = support * 100;
    if (support >= FAILURE_THRESHOLD) holds++;
  }
  return { prep, trace: { integrities, holds, z, conf } };
}

export function runProbabilistic(
  graph: Graph,
  opts?: { samples?: number; seed?: number },
): ProbabilisticResult {
  const samples = opts?.samples ?? DEFAULT_SAMPLES;
  const seed = opts?.seed ?? hashSeed(seedString(graph));
  const { trace } = sampleRun(graph, samples, seed);
  const sorted = [...trace.integrities].sort((a, b) => a - b);
  const mean = trace.integrities.reduce((s, v) => s + v, 0) / samples;
  return {
    pHold: trace.holds / samples,
    mean,
    band: [quantile(sorted, 0.05), quantile(sorted, 0.95)],
    samples,
    keystoneDrivers: [],       // Task 3
    keystoneAssumptions: [],   // Task 3
    clusters: [],              // Task 3
    coFailure: [],             // Task 3
  };
}
