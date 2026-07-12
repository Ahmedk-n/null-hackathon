import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Attack, Graph, ProbabilisticResult, ReinforcementPlan } from "@/engine";
// P2-T5 (additive): cross-decision calibration. Type-only import of the pure result shape — the
// store never fetches it (that stays in KeystoneApp via fetchCalibration); it only holds the
// value pushed in by setCalibration. @/engine/calibrate is pure/key-free, so this is boundary-safe.
import type { Calibration } from "@/engine/calibrate";
// P3-T7 (additive): the contextual analysis council's result. Type-only — the store never runs
// the council itself (that stays server-side / KeystoneApp's fetchCouncil, mirroring the
// calibration idiom above); it only holds the plain-data value pushed in by setCouncil. A VALUE
// reference to any @/agents/* module is banned by the boundary test, so this stays type-only.
import type { CouncilResult } from "@/agents/council/types";
import {
  applyAttacks,
  cloneGraph,
  detectFailures,
  FAILURE_THRESHOLD,
  integrity,
  keystone,
  minimalReinforcement,
} from "@/engine";
// PROBABILISTIC (Task 6): pure, seeded Monte-Carlo over the frozen engine. Deep path (never
// through a barrel that also drags in llm/context) — safe under the client/key-safety boundary
// guard. Called ONLY inside store actions (never in render); no Date/Math.random anywhere in it.
import { runProbabilistic } from "@/engine/probabilistic";
// Pure, key-free transform (data-in/data-out). Safe to bundle client-side. This is the ONLY
// context import allowed in the store — never the compiler, the llm client, or the Anthropic SDK.
import { reweightAttacksByContext } from "@/context/weights";
// V5-3 (additive): the manual-edit validation wall. Pure (engine types + normaliseCategory only —
// never the llm client / Anthropic SDK), so importing it keeps the client/key-safety boundary green.
import { validateManualEdit } from "@/llm/validate";
// V3-7 (additive): pure, key-free time-axis transforms. Deep path (never the barrel)
// so the client/key-safety boundary guard stays happy.
import { adjustmentsAt, failsInDays, CRATER_THRESHOLD } from "@/context/timeline";
import type { CompanyContext, DecisionContextPack } from "@/context";

// V3-7 helper: the un-reinforced structure's failure horizon under the current raw
// attacks + context timeline. Only meaningful GROUNDED (context weights on) with a
// pack present; RAW mode has no temporal axis → null. Pure/deterministic.
function deriveFailsInDay(
  baseGraph: Graph | null,
  rawAttacks: Attack[],
  pack: DecisionContextPack | null,
  applyContextWeights: boolean,
): number | null {
  if (!applyContextWeights || !baseGraph || !pack || rawAttacks.length === 0) return null;
  return failsInDays(baseGraph, rawAttacks, pack, CRATER_THRESHOLD);
}

// V5-3 · deterministic id from a human label (no Math.random/Date — client-safe). Lowercase,
// non-alphanumerics → single dashes, trimmed. Empty/symbol-only labels fall back to "assumption".
function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "assumption";
}

// V5-3 · unique id: append -2, -3, … until it clears the taken set. Deterministic.
function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Task 7 · DRIVER-PRESERVING PROBABILISTIC SOLVE. The engine's `cloneGraph` (sensitivity.ts,
// off-limits) intentionally drops the engine-inert `graph.drivers`, so any working graph rebuilt
// through `applyAttacks(cloneGraph(base), …)` carries NO drivers — and the Monte-Carlo brain would
// then infer zero correlation structure (empty clusters / keystoneDrivers / coFailure), collapsing
// the whole "correlated failure" story back to independent noise. We keep the drivers on the store's
// baseGraph (see setGraph) and re-attach them onto the working graph here before every solve. This
// is provably engine-inert: the pure solver (propagation/sensitivity/load) never reads graph.drivers.
function solveProbabilistic(working: Graph, base: Graph | null): ProbabilisticResult {
  const drivers = base?.drivers;
  return runProbabilistic(drivers && drivers.length > 0 ? { ...working, drivers } : working);
}

// Stable empty reference reused for the "no failures" case. Returning a fresh `new Set()` from a
// selector on every render breaks React 19's useSyncExternalStore (snapshot must be referentially
// stable) and causes "Maximum update depth exceeded" + hydration mismatch. `failures` therefore
// lives in state and is only rebuilt inside actions.
const EMPTY_FAILURES: ReadonlySet<string> = new Set();

export interface KeystoneState {
  baseGraph: Graph | null;
  workingGraph: Graph | null;
  attacks: Attack[];
  // The un-reweighted attacks last passed to applyLoad. Kept so the A/B toggle can
  // recompute raw⟷reweighted live without a round-trip to /api/attacks.
  rawAttacks: Attack[];
  loadApplied: boolean;
  failures: ReadonlySet<string>;
  companyContext: CompanyContext | null;
  decisionContextPack: DecisionContextPack | null;
  contextSource: "live" | "fixture" | null;
  applyContextWeights: boolean;
  // R2 (additive): GRAPH-tab node selection + 3D board tilt.
  selectedNodeId: string | null;
  tilt: boolean;
  // W2-2 (additive): deterministic re-run beat. `rerunConfirmed` drives the transient
  // "IDENTICAL ✓ DETERMINISTIC" chip; `rerunIdentical` is the dev-level equality verdict
  // (null = never re-run yet). Neither ever throws in the prod path.
  rerunConfirmed: boolean;
  rerunIdentical: boolean | null;
  // V3-2 (additive): the minimum-reinforcement prescription for the current attacked
  // structure. null until `reinforce()` fires; cleared by any action that rebuilds the
  // working graph (so the DE-RISKING PLAN panel never shows a stale plan).
  reinforcementPlan: ReinforcementPlan | null;
  // V3-7 (additive): time-axis stress. `timelineDay` is the scrub offset in days
  // from now (0..horizon); `failsInDay` is the FIRST day the un-reinforced structure
  // craters below the failure line (null = survives the horizon), derived GROUNDED-only.
  timelineDay: number;
  failsInDay: number | null;
  // V5-3 (additive): the last graph-edit rejection reason, surfaced as a --warn chip in the
  // SelectionPanel EDIT section. null = no pending error. Every SUCCESSFUL edit clears it.
  editError: string | null;
  // PROBABILISTIC (Task 6): the Monte-Carlo distribution over the CURRENT workingGraph. null
  // until a solve has run (baseline / no-load state has no meaningful distribution to show).
  // Recomputed alongside every action that rebuilds workingGraph from a solve; reset to null
  // wherever `failures` resets to EMPTY_FAILURES (same "back to baseline" moments).
  probabilistic: ProbabilisticResult | null;
  // P2-T5 (additive): the caller's cross-decision track record (real, per-user when signed in —
  // possibly an honest EMPTY record; else the offline over-holder fixture — see fetchCalibration).
  // null until KeystoneApp's effect resolves it; the store itself never fetches (purity/boundary —
  // see setCalibration).
  calibration: Calibration | null;
  // Phase 2 whole-feature fix (honesty bug): true ONLY for the guest/offline fixture — an
  // illustrative sample, never the signed-in caller's real record (see fetchCalibration's
  // CalibrationResult.isSample). Init false so a signed-in user is never mislabelled before the
  // fetch effect resolves. Consumed by IntegrityGauge to word the caption honestly.
  calibrationIsSample: boolean;
  // P3-T7 (additive): the contextual analysis council's result for the CURRENT graph — null
  // until KeystoneApp's post-extract fetchCouncil effect resolves (or when it resolves to null:
  // failure/guest-with-no-key, meaning "no contextual overlay, deterministic view only"). Reset
  // to null by setGraph/reset (a new graph invalidates any prior council read) exactly like
  // reinforcementPlan/probabilistic above. Consumed by the four non-timeline solve actions below
  // to swap in `council.contextualAttacks` for the keyword reweight when LIVE + grounded.
  council: CouncilResult | null;
  setGraph: (g: Graph) => void;
  setConfidence: (id: string, value: number) => void;
  // V5-3 (additive): inspector-panel graph editing. Every action runs the edit on a CLONE and
  // re-validates with the relaxed manual caps (3..25) before committing; invalid → editError,
  // state untouched. STRUCTURAL edits (delete / add / flip) additionally RESET the stress verdict
  // and rebuild workingGraph from the edited baseGraph (integrity re-derived at baseline). RENAME
  // is non-structural: it marks provenance but preserves any applied load. Edited nodes become
  // provenance:"modified" → MODIFIED — UNVERIFIED (evidence plate detaches).
  renameNode: (id: string, label: string) => void;
  deleteNode: (id: string) => void;
  addAssumption: (parentId: string, label: string, confidence?: number) => void;
  flipGroupKind: (nodeId: string, groupIndex: number) => void;
  clearEditError: () => void;
  setContext: (
    companyContext: CompanyContext,
    decisionContextPack: DecisionContextPack,
    source: "live" | "fixture",
  ) => void;
  applyLoad: (attacks: Attack[]) => void;
  setApplyContextWeights: (value: boolean) => void;
  reset: () => void;
  setSelectedNode: (id: string | null) => void;
  setTilt: (tilt: boolean) => void;
  // W2-2 (additive): recompute the whole pipeline from the stored raw inputs and
  // assert the verdict is byte-identical (visible determinism).
  rerun: () => void;
  clearRerunConfirmed: () => void;
  // V3-2 (additive): run the minimum-reinforcement solver on the current attacked
  // structure and apply the prescribed confidence restores to the working graph.
  reinforce: () => void;
  // V3-7 (additive): scrub the time axis — re-derive effective attacks for `day`
  // via adjustmentsAt + reweight and re-run the engine live on a clean clone.
  setTimelineDay: (day: number) => void;
  // P2-T5 (additive): push a freshly-fetched calibration into the store. The store never calls
  // fetch itself (see the `calibration` field comment) — KeystoneApp fetches via
  // fetchCalibration(isGuest) and hands the plain result to this setter. `isSample` defaults to
  // false (a real/empty record) so callers that only pass the calibration value never
  // accidentally mislabel it as a sample.
  setCalibration: (c: Calibration | null, isSample?: boolean) => void;
  // P3-T7 · store only HOLDS the value — no fetch here (boundary/purity, mirrors setCalibration).
  // KeystoneApp calls fetchCouncil(...) after the extract step and hands the plain result (or
  // null) to this setter.
  setCouncil: (c: CouncilResult | null) => void;
}

export function createKeystoneStore() {
  return createStore<KeystoneState>((set, get) => ({
    baseGraph: null,
    workingGraph: null,
    attacks: [],
    rawAttacks: [],
    loadApplied: false,
    failures: EMPTY_FAILURES,
    companyContext: null,
    decisionContextPack: null,
    contextSource: null,
    applyContextWeights: true,
    selectedNodeId: null,
    tilt: true,
    rerunConfirmed: false,
    rerunIdentical: null,
    reinforcementPlan: null,
    timelineDay: 0,
    failsInDay: null,
    editError: null,
    probabilistic: null,
    calibration: null,
    calibrationIsSample: false,
    council: null,
    setGraph: (g) => {
      // Preserve the engine-inert drivers onto the store's base/working graphs — cloneGraph
      // strips them (see solveProbabilistic above), and they are the correlation structure the
      // probabilistic brain needs. Undefined when the graph carries no drivers (harmless).
      const base = cloneGraph(g);
      const working = cloneGraph(g);
      base.drivers = g.drivers;
      working.drivers = g.drivers;
      set({ baseGraph: base, workingGraph: working, attacks: [], rawAttacks: [], loadApplied: false, failures: EMPTY_FAILURES, reinforcementPlan: null, timelineDay: 0, failsInDay: null, probabilistic: null, council: null });
    },
    setConfidence: (id, value) => {
      const wg = get().workingGraph;
      if (!wg) return;
      const next = cloneGraph(wg);
      const node = next.nodes.find((n) => n.id === id);
      if (node) node.confidence = Math.min(1, Math.max(0, value));
      // Re-derive failures only if we are in the post-load state; before load nothing is "failed".
      const loadApplied = get().loadApplied;
      const failures = loadApplied ? detectFailures(next) : EMPTY_FAILURES;
      // Task 7 fold-in — the confidence edit rebuilt `next`, so the probabilistic distribution
      // over the OLD working graph is now stale. Recompute it from the rebuilt graph while load
      // is applied (matches the "workingGraph changed under load" contract of the other actions);
      // at baseline there is no distribution to show, so it stays null.
      set({ workingGraph: next, failures, reinforcementPlan: null, probabilistic: loadApplied ? solveProbabilistic(next, get().baseGraph) : null });
    },
    // ── V5-3 · GRAPH EDITING ────────────────────────────────────────────────
    // Structural edits (delete / add / flip) reset the stress verdict back to baseline:
    // attacks, the raw attacks, the applied-load flag, failures, the de-risking plan, and the
    // time axis are all cleared, and the working graph is rebuilt from the edited base graph so
    // integrity re-derives at baseline. The pure engine re-verdicts automatically (the
    // integrity/keystone/failures selectors read workingGraph) — that's the live CAD moment.
    renameNode: (id, label) => {
      const { baseGraph, workingGraph } = get();
      if (!baseGraph) return;
      const nextBase = cloneGraph(baseGraph);
      const bNode = nextBase.nodes.find((n) => n.id === id);
      if (!bNode) {
        set({ editError: `Cannot rename — unknown node "${id}".` });
        return;
      }
      bNode.label = label;
      bNode.provenance = "modified";
      // Rename can't alter structure, but we still run the wall so a base that somehow drifted
      // invalid is rejected rather than committed.
      const validated = validateManualEdit(nextBase);
      if (!validated) {
        set({ editError: "Rename rejected — the structure would be invalid." });
        return;
      }
      // Preserve the engine-inert drivers onto the rebuilt base/working graphs — cloneGraph
      // (via validateManualEdit) strips them; see setGraph for the same idiom.
      validated.drivers = baseGraph.drivers;
      // Non-structural: PRESERVE the current stress state. Mirror the edit onto the working
      // graph in place (same node id) so an attacked structure keeps its verdict.
      let nextWorking = workingGraph;
      if (workingGraph) {
        nextWorking = cloneGraph(workingGraph);
        const wNode = nextWorking.nodes.find((n) => n.id === id);
        if (wNode) {
          wNode.label = label;
          wNode.provenance = "modified";
        }
        nextWorking.drivers = workingGraph.drivers;
      }
      set({ baseGraph: validated, workingGraph: nextWorking, editError: null });
    },
    deleteNode: (id) => {
      const { baseGraph, selectedNodeId } = get();
      if (!baseGraph) return;
      if (id === baseGraph.thesisId) {
        set({ editError: "Cannot delete the thesis — it is the root of the Structure." });
        return;
      }
      const next = cloneGraph(baseGraph);
      // Drop the node, then unwire it from every group and drop groups left empty. Orphaned
      // subtree nodes (now unreachable from the thesis) are pruned by validateManualEdit's
      // reachability repair — the same logic the LLM wall uses.
      next.nodes = next.nodes.filter((n) => n.id !== id);
      for (const n of next.nodes) {
        n.groups = n.groups
          .map((g) => ({ kind: g.kind, childIds: g.childIds.filter((c) => c !== id) }))
          .filter((g) => g.childIds.length > 0);
      }
      const validated = validateManualEdit(next);
      if (!validated) {
        set({ editError: "Delete rejected — the remaining Structure would be invalid." });
        return;
      }
      // Preserve the engine-inert drivers onto the rebuilt base/working graphs — cloneGraph
      // strips them; see setGraph for the same idiom.
      validated.drivers = baseGraph.drivers;
      const nextWorking = cloneGraph(validated);
      nextWorking.drivers = baseGraph.drivers;
      set({
        baseGraph: validated,
        workingGraph: nextWorking,
        // If the deleted (or an orphaned) node was selected, drop the stale selection.
        selectedNodeId:
          selectedNodeId && validated.nodes.some((n) => n.id === selectedNodeId)
            ? selectedNodeId
            : null,
        attacks: [],
        rawAttacks: [],
        loadApplied: false,
        failures: EMPTY_FAILURES,
        reinforcementPlan: null,
        timelineDay: 0,
        failsInDay: null,
        probabilistic: null,
        editError: null,
      });
    },
    addAssumption: (parentId, label, confidence = 0.5) => {
      const { baseGraph } = get();
      if (!baseGraph) return;
      const next = cloneGraph(baseGraph);
      const parent = next.nodes.find((n) => n.id === parentId);
      if (!parent || (parent.type !== "claim" && parent.type !== "thesis")) {
        set({ editError: "Assumptions attach to a claim or the thesis." });
        return;
      }
      const id = uniqueId(slugify(label), new Set(next.nodes.map((n) => n.id)));
      next.nodes.push({
        id,
        type: "assumption",
        label,
        confidence: Math.min(1, Math.max(0, confidence)),
        groups: [],
        provenance: "modified",
      });
      // Append to the parent's first AND group (assumptions are conjunctive support by default);
      // create one if the parent has no AND group yet.
      const andGroup = parent.groups.find((g) => g.kind === "AND");
      if (andGroup) andGroup.childIds.push(id);
      else parent.groups.push({ kind: "AND", childIds: [id] });
      const validated = validateManualEdit(next);
      if (!validated) {
        set({ editError: "Add rejected — the Structure would exceed the node limit." });
        return;
      }
      // Preserve the engine-inert drivers onto the rebuilt base/working graphs — cloneGraph
      // strips them; see setGraph for the same idiom.
      validated.drivers = baseGraph.drivers;
      const nextWorking = cloneGraph(validated);
      nextWorking.drivers = baseGraph.drivers;
      set({
        baseGraph: validated,
        workingGraph: nextWorking,
        selectedNodeId: id,
        attacks: [],
        rawAttacks: [],
        loadApplied: false,
        failures: EMPTY_FAILURES,
        reinforcementPlan: null,
        timelineDay: 0,
        failsInDay: null,
        probabilistic: null,
        editError: null,
      });
    },
    flipGroupKind: (nodeId, groupIndex) => {
      const { baseGraph } = get();
      if (!baseGraph) return;
      const next = cloneGraph(baseGraph);
      const node = next.nodes.find((n) => n.id === nodeId);
      if (!node || !node.groups[groupIndex]) {
        set({ editError: "Cannot flip — no such dependency group." });
        return;
      }
      const group = node.groups[groupIndex];
      group.kind = group.kind === "AND" ? "OR" : "AND";
      node.provenance = "modified";
      const validated = validateManualEdit(next);
      if (!validated) {
        set({ editError: "Flip rejected — the Structure would be invalid." });
        return;
      }
      // Preserve the engine-inert drivers onto the rebuilt base/working graphs — cloneGraph
      // strips them; see setGraph for the same idiom.
      validated.drivers = baseGraph.drivers;
      const nextWorking = cloneGraph(validated);
      nextWorking.drivers = baseGraph.drivers;
      set({
        baseGraph: validated,
        workingGraph: nextWorking,
        attacks: [],
        rawAttacks: [],
        loadApplied: false,
        failures: EMPTY_FAILURES,
        reinforcementPlan: null,
        timelineDay: 0,
        failsInDay: null,
        probabilistic: null,
        editError: null,
      });
    },
    clearEditError: () => set({ editError: null }),
    setContext: (companyContext, decisionContextPack, source) =>
      set({ companyContext, decisionContextPack, contextSource: source }),
    applyLoad: (attacks) => {
      const base = get().baseGraph ?? get().workingGraph;
      if (!base) return;
      const { applyContextWeights, decisionContextPack, council } = get();
      // P3-T7: when a LIVE, grounded council is present, its situation-specific attacks REPLACE
      // the keyword reweight (the council did strictly more work — it read the actual context
      // pack + findings, not just category keyword matches). A fixture-sourced council (no key /
      // offline) or an empty contextualAttacks array falls back to the original keyword reweight.
      const useCouncil =
        !!council && council.source === "live" && council.grounded && council.contextualAttacks.length > 0;
      // The ONLY place context math meets the engine: reweight severities BEFORE applyAttacks.
      const effective = applyContextWeights
        ? useCouncil
          ? council.contextualAttacks
          : decisionContextPack
            ? reweightAttacksByContext(attacks, decisionContextPack.contextWeightAdjustments)
            : attacks
        : attacks;
      // Always apply against a clean baseline clone so re-applying (e.g. the A/B
      // toggle) never double-attacks an already-stressed graph.
      const workingGraph = applyAttacks(cloneGraph(base), effective);
      // V3-7: the time-axis failure horizon is a property of the base structure under
      // the RAW attacks + context timeline — reset the scrub to now and (grounded-only)
      // derive the day it craters.
      const failsInDay = deriveFailsInDay(base, attacks, decisionContextPack, applyContextWeights);
      set({ workingGraph, attacks: effective, rawAttacks: attacks, loadApplied: true, failures: detectFailures(workingGraph), reinforcementPlan: null, timelineDay: 0, failsInDay, probabilistic: solveProbabilistic(workingGraph, base) });
    },
    // A/B toggle: IGNORE CONTEXT (raw) ⟷ GROUND IN CONTEXT (reweighted). Flipping it
    // re-derives the outcome live from the stored raw attacks — no re-fetch needed.
    setApplyContextWeights: (value) => {
      const { loadApplied, rawAttacks, baseGraph, decisionContextPack, council } = get();
      if (!loadApplied || !baseGraph || rawAttacks.length === 0) {
        set({ applyContextWeights: value });
        return;
      }
      // P3-T7: same council-over-reweight preference as applyLoad (see its comment).
      const useCouncil =
        !!council && council.source === "live" && council.grounded && council.contextualAttacks.length > 0;
      const effective = value
        ? useCouncil
          ? council.contextualAttacks
          : decisionContextPack
            ? reweightAttacksByContext(rawAttacks, decisionContextPack.contextWeightAdjustments)
            : rawAttacks
        : rawAttacks;
      const workingGraph = applyAttacks(cloneGraph(baseGraph), effective);
      set({
        applyContextWeights: value,
        workingGraph,
        attacks: effective,
        failures: detectFailures(workingGraph),
        // Toggling the attack basis re-derives the outcome from raw state, so any prior
        // reinforcement no longer describes the graph on screen — clear it.
        reinforcementPlan: null,
        // V3-7: RAW has no temporal axis (failsInDay → null); GROUNDED re-derives it.
        // Reset the scrub to now so the two views stay coherent.
        timelineDay: 0,
        failsInDay: deriveFailsInDay(baseGraph, rawAttacks, decisionContextPack, value),
        probabilistic: solveProbabilistic(workingGraph, baseGraph),
      });
    },
    reset: () => {
      const base = get().baseGraph;
      if (!base) return;
      set({ workingGraph: cloneGraph(base), attacks: [], rawAttacks: [], loadApplied: false, failures: EMPTY_FAILURES, reinforcementPlan: null, timelineDay: 0, failsInDay: null, probabilistic: null, council: null });
    },
    setSelectedNode: (id) => set({ selectedNodeId: id }),
    setTilt: (tilt) => set({ tilt }),
    // W2-2: re-execute the engine pipeline from the *stored raw inputs* (baseGraph +
    // rawAttacks + context flag/pack) and prove the verdict is byte-identical. The engine
    // is pure, so this recomputation is deterministic; we compare integrity/keystone/failures
    // and expose a boolean (dev-level assertion — never throws in the prod path).
    rerun: () => {
      const { baseGraph, workingGraph, rawAttacks, applyContextWeights, decisionContextPack, failures, council } =
        get();
      if (!baseGraph || !workingGraph) {
        set({ rerunConfirmed: true, rerunIdentical: null });
        return;
      }
      // Capture the current verdict before recomputing.
      const prevIntegrity = integrity(workingGraph);
      const prevKeystone = keystone(workingGraph)?.id ?? null;
      const prevFailures = failures;
      // Re-run the exact pipeline applyLoad uses, from the raw attacks — including the P3-T7
      // council-over-reweight preference (see applyLoad's comment), so a re-run stays byte-identical
      // to the run it is verifying.
      const useCouncil =
        !!council && council.source === "live" && council.grounded && council.contextualAttacks.length > 0;
      const effective = applyContextWeights
        ? useCouncil
          ? council.contextualAttacks
          : decisionContextPack
            ? reweightAttacksByContext(rawAttacks, decisionContextPack.contextWeightAdjustments)
            : rawAttacks
        : rawAttacks;
      const nextGraph = applyAttacks(cloneGraph(baseGraph), effective);
      const nextFailures = detectFailures(nextGraph);
      const nextIntegrity = integrity(nextGraph);
      const nextKeystone = keystone(nextGraph)?.id ?? null;
      const identical =
        prevIntegrity === nextIntegrity &&
        prevKeystone === nextKeystone &&
        prevFailures.size === nextFailures.size &&
        [...prevFailures].every((id) => nextFailures.has(id));
      set({
        workingGraph: nextGraph,
        attacks: effective,
        failures: nextFailures,
        rerunIdentical: identical,
        rerunConfirmed: true,
        // Re-run rebuilds the working graph from the raw attacks (the attacked verdict),
        // discarding any applied reinforcement — drop the stale plan.
        reinforcementPlan: null,
        probabilistic: solveProbabilistic(nextGraph, baseGraph),
      });
    },
    clearRerunConfirmed: () => set({ rerunConfirmed: false }),
    // V3-2 · MINIMUM-REINFORCEMENT. Recompute the effective attacks exactly as
    // applyLoad does (respect applyContextWeights + the context pack), run the pure
    // solver at the failure line (35 = FAILURE_THRESHOLD on the 0..100 integrity scale),
    // then apply the prescribed confidence restores to a fresh clone of the ATTACKED
    // graph. The engine — not the solver — recomputes integrity/failures from the result.
    reinforce: () => {
      const { baseGraph, rawAttacks, applyContextWeights, decisionContextPack, council } = get();
      if (!baseGraph || rawAttacks.length === 0) return;
      // P3-T7: same council-over-reweight preference as applyLoad (see its comment) — the
      // reinforcement solver must target the SAME effective attacks the current verdict is under.
      const useCouncil =
        !!council && council.source === "live" && council.grounded && council.contextualAttacks.length > 0;
      const effective = applyContextWeights
        ? useCouncil
          ? council.contextualAttacks
          : decisionContextPack
            ? reweightAttacksByContext(rawAttacks, decisionContextPack.contextWeightAdjustments)
            : rawAttacks
        : rawAttacks;
      const plan = minimalReinforcement(baseGraph, effective, FAILURE_THRESHOLD * 100);
      // Rebuild the attacked graph, then heal the plan's assumptions back to base confidence.
      const workingGraph = applyAttacks(cloneGraph(baseGraph), effective);
      for (const id of plan.targetIds) {
        const node = workingGraph.nodes.find((n) => n.id === id);
        const baseNode = baseGraph.nodes.find((n) => n.id === id);
        if (node && baseNode) node.confidence = baseNode.confidence;
      }
      // V3-7: proving the crux composes with the time axis — if the reinforced
      // structure now clears the crater line, it survives the whole horizon, so the
      // "FAILS IN N DAYS" chip flips to SURVIVES (failsInDay → null). Otherwise keep
      // the un-reinforced horizon. (Scrubbing the slider afterward rebuilds the working
      // graph from raw attacks, clearing the plan and re-deriving failsInDay — documented.)
      const failsInDay = integrity(workingGraph) >= CRATER_THRESHOLD
        ? null
        : deriveFailsInDay(baseGraph, rawAttacks, decisionContextPack, applyContextWeights);
      set({
        workingGraph,
        attacks: effective,
        loadApplied: true,
        failures: detectFailures(workingGraph),
        reinforcementPlan: plan,
        failsInDay,
        probabilistic: solveProbabilistic(workingGraph, baseGraph),
      });
    },
    // V3-7 · TIME-AXIS SCRUB. Re-derive effective attacks for `day` (temporal
    // adjustments recomputed via adjustmentsAt, then the same frozen reweight seam
    // applyLoad uses) and re-run the engine live on a clean baseline clone. Mirrors
    // setApplyContextWeights' pattern. Only shifts the outcome when loadApplied &&
    // applyContextWeights && a pack is present; RAW mode is day-invariant.
    // P3-T7: deliberately NOT wired to `council` — the council's contextualAttacks are a single
    // static snapshot (no day axis), while this scrub is specifically about how the reweight
    // shifts DAY BY DAY via adjustmentsAt. Swapping in the council here would collapse the
    // timeline back to a day-invariant view, defeating the feature. Keyword reweight only.
    setTimelineDay: (day) => {
      const { loadApplied, rawAttacks, baseGraph, decisionContextPack, applyContextWeights } = get();
      if (!loadApplied || !baseGraph || rawAttacks.length === 0) {
        set({ timelineDay: day });
        return;
      }
      const effective =
        applyContextWeights && decisionContextPack
          ? reweightAttacksByContext(rawAttacks, adjustmentsAt(decisionContextPack, day))
          : rawAttacks;
      const workingGraph = applyAttacks(cloneGraph(baseGraph), effective);
      set({
        timelineDay: day,
        workingGraph,
        attacks: effective,
        failures: detectFailures(workingGraph),
        // Scrubbing rebuilds the working graph from the raw attacks, discarding any
        // applied reinforcement — drop the stale plan (mirrors the A/B toggle) and
        // re-derive the (un-reinforced) failure horizon so the chip stays coherent.
        reinforcementPlan: null,
        failsInDay: deriveFailsInDay(baseGraph, rawAttacks, decisionContextPack, applyContextWeights),
        probabilistic: solveProbabilistic(workingGraph, baseGraph),
      });
    },
    // P2-T5 · store only HOLDS the value — no fetch here (boundary/purity). KeystoneApp calls
    // fetchCalibration(isGuest) in an effect and pushes the result in.
    setCalibration: (c, isSample = false) => set({ calibration: c, calibrationIsSample: isSample }),
    // P3-T7 · store only HOLDS the council result — no fetch here (boundary/purity). KeystoneApp
    // calls fetchCouncil({graph, pack, company, findings}) in the post-extract effect and pushes
    // the result (or null on failure/no-key) in.
    setCouncil: (c) => set({ council: c }),
  }));
}

export const selectIntegrity = (s: KeystoneState): number => (s.workingGraph ? integrity(s.workingGraph) : 0);
export const selectKeystoneId = (s: KeystoneState): string | null => (s.workingGraph ? keystone(s.workingGraph)?.id ?? null : null);
// Reads stable state — never allocates. Rebuilt only inside actions above.
export const selectFailures = (s: KeystoneState): ReadonlySet<string> => s.failures;
// PROBABILISTIC (Task 6): the Monte-Carlo distribution over the current workingGraph.
// null before any solve / at baseline; populated by applyLoad, setApplyContextWeights,
// setTimelineDay, reinforce, and rerun.
export const selectProbabilistic = (s: KeystoneState): ProbabilisticResult | null => s.probabilistic;
// P2-T5 (additive): the caller's cross-decision calibration (null until KeystoneApp's fetch
// effect resolves). Consumed by the gauge/rail to render RAW → CALIBRATED P(hold).
export const selectCalibration = (s: KeystoneState): Calibration | null => s.calibration;
// Phase 2 whole-feature fix (honesty bug): true ONLY when `calibration` is the guest/offline
// illustrative fixture — never for a signed-in caller's real record (empty or not). Consumed by
// IntegrityGauge to word the RAW→CALIBRATED caption honestly.
export const selectCalibrationIsSample = (s: KeystoneState): boolean => s.calibrationIsSample;
// P3-T7 (additive): the contextual analysis council's result for the current graph (null until
// KeystoneApp's post-extract fetch resolves, or permanently null if it resolved to no overlay).
export const selectCouncil = (s: KeystoneState): CouncilResult | null => s.council;

// Shared singleton for the React app.
export const keystoneStore = createKeystoneStore();
export function useKeystone<T>(selector: (s: KeystoneState) => T): T {
  return useStore(keystoneStore, selector);
}
