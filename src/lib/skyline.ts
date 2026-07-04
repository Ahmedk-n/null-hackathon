// V6-3 · THE SKYLINE — the whole decision library rendered as one load-bearing assembly.
//
// PURE module (no React, no wall-clock, no randomness, no LLM): data-in / data-out so the
// shared-foundation matcher and the crack re-verdict are fully unit-testable and safe to bundle
// anywhere. It leans only on the pure engine (integrity / keystone / cloneGraph) and on library +
// context types. It is TOLERANT: a malformed entry (missing/cyclic graph) is skipped, never thrown.
//
// A "shared foundation" is an assumption that appears — by deterministic label similarity, NOT the
// LLM — in more than one saved decision: a load-bearing column under multiple buildings. Cracking
// it (confidence → 0 on the member node in each building) re-verdicts every structure resting on it.
import type { Graph } from "@/engine";
import { integrity, keystone, cloneGraph } from "@/engine";
import type { LibraryEntry } from "./library";
import {
  fixtureContextGraph,
  fixtureContextGraphB,
  fixtureContextGraphR,
  HERO_CONTEXT_INPUT,
  REAL_CONTEXT_INPUT,
  REINFORCE_CONTEXT_INPUT,
} from "@/context/fixtures";

// The integrity band a building is judged by — the SAME 35/10 thresholds as the gauge and depth
// vocabulary (HOLDING ≥ 35 · STRESSED 10–35 · FAILED < 10). A cracked building "collapses" when it
// drops below the HOLDING threshold (< 35).
export const HOLDING_THRESHOLD = 35;

// ── Public shapes ──────────────────────────────────────────────────────────

export interface SkylineBuilding {
  entryId: string;
  title: string;
  /** Structural integrity of the saved graph, 0..100 (recomputed by the pure engine). */
  integrity: number;
  nodeCount: number;
  keystoneId: string | null;
}

export interface FoundationMember {
  entryId: string;
  nodeId: string;
  label: string;
}

export interface SharedFoundation {
  /** Deterministic id (assigned by stable sort order). */
  id: string;
  /** Representative label — the SHORTEST member label (ties: lexicographically smallest). */
  label: string;
  members: FoundationMember[];
  /** Number of DISTINCT buildings (entries) this foundation spans. Always ≥ 2. */
  count: number;
}

export interface Skyline {
  buildings: SkylineBuilding[];
  foundations: SharedFoundation[];
}

export interface CrackResult {
  entryId: string;
  integrityBefore: number;
  integrityAfter: number;
  /** True when the building drops below the HOLDING band (< 35) after the crack. */
  failed: boolean;
}

// ── Token-set matching (deterministic, no LLM) ───────────────────────────────

// Lower-signal words stripped before comparison so similarity keys on the load-bearing nouns.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "be", "been", "to", "of", "for", "and", "or", "in", "on", "with",
  "by", "has", "have", "had", "its", "it", "we", "our", "us", "their", "they", "this", "that",
  "can", "will", "would", "now", "not", "no", "enough", "over", "across", "than", "as", "at",
  "from", "into", "up", "down", "out", "per", "vs", "so", "but", "if", "when", "while", "yet",
]);

/** Lowercase, strip punctuation, split on whitespace, drop stopwords → a stable token SET. */
export function tokenizeLabel(label: string): Set<string> {
  return new Set(
    (label ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0 && !STOPWORDS.has(t)),
  );
}

/** Token-set Jaccard similarity in [0,1]. Two empty labels never match (returns 0). */
export function labelSimilarity(a: string, b: string): number {
  const sa = tokenizeLabel(a);
  const sb = tokenizeLabel(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** The similarity threshold at/above which two assumption labels are the "same" foundation. */
export const MATCH_THRESHOLD = 0.5;

// ── buildSkyline ─────────────────────────────────────────────────────────────

interface AssumptionItem {
  entryId: string;
  nodeId: string;
  label: string;
  tokens: Set<string>;
}

function graphLooksValid(g: unknown): g is Graph {
  const gg = g as { nodes?: unknown; thesisId?: unknown } | null | undefined;
  return !!gg && Array.isArray(gg.nodes) && typeof gg.thesisId === "string";
}

/**
 * Assemble the skyline: one building per (valid) entry, plus the shared foundations that link them.
 * Malformed entries are skipped, never thrown — the same tolerance the library read path uses.
 */
export function buildSkyline(entries: LibraryEntry[]): Skyline {
  const buildings: SkylineBuilding[] = [];
  const items: AssumptionItem[] = [];

  for (const entry of entries ?? []) {
    try {
      const g = entry?.graph;
      if (!graphLooksValid(g)) continue;
      // integrity()/keystone() throw on cyclic or dangling graphs — the try/catch skips them.
      const intg = integrity(g);
      const key = keystone(g);
      buildings.push({
        entryId: entry.id,
        title: entry.title,
        integrity: intg,
        nodeCount: g.nodes.length,
        keystoneId: key?.id ?? null,
      });
      for (const n of g.nodes) {
        if (n.type !== "assumption") continue;
        const tokens = tokenizeLabel(n.label ?? "");
        if (tokens.size === 0) continue;
        items.push({ entryId: entry.id, nodeId: n.id, label: n.label, tokens });
      }
    } catch {
      continue; // corrupted entry → skipped
    }
  }

  return { buildings, foundations: clusterFoundations(items) };
}

// Cluster assumption items across entries by transitive Jaccard ≥ MATCH_THRESHOLD (union-find,
// deterministic in input order). A foundation is kept ONLY when its cluster spans ≥ 2 DISTINCT
// entries — so same-entry duplicates (that match nothing in another building) never form one.
function clusterFoundations(items: AssumptionItem[]): SharedFoundation[] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (jaccardOf(items[i].tokens, items[j].tokens) >= MATCH_THRESHOLD) union(i, j);
    }
  }

  const clusters = new Map<number, AssumptionItem[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = clusters.get(r) ?? [];
    arr.push(items[i]);
    clusters.set(r, arr);
  }

  const foundations: SharedFoundation[] = [];
  for (const members of clusters.values()) {
    const entryIds = new Set(members.map((m) => m.entryId));
    if (entryIds.size < 2) continue; // must span ≥ 2 distinct buildings
    const sortedMembers = [...members]
      .map((m) => ({ entryId: m.entryId, nodeId: m.nodeId, label: m.label }))
      .sort((a, b) =>
        a.entryId === b.entryId ? a.nodeId.localeCompare(b.nodeId) : a.entryId.localeCompare(b.entryId),
      );
    foundations.push({
      id: "",
      label: representativeLabel(sortedMembers),
      members: sortedMembers,
      count: entryIds.size,
    });
  }

  // Stable order: most-shared first, then label; ids assigned from that order.
  foundations.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
  foundations.forEach((f, i) => {
    f.id = `foundation-${i}`;
  });
  return foundations;
}

function jaccardOf(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Shortest label wins (a plainer phrasing is the clearest column name); ties break lexicographically.
function representativeLabel(members: FoundationMember[]): string {
  return members
    .map((m) => m.label)
    .reduce((best, l) => (l.length < best.length || (l.length === best.length && l < best) ? l : best));
}

// ── crackFoundation ──────────────────────────────────────────────────────────

/**
 * Crack a shared foundation: for each building the foundation touches, clone that building's graph,
 * knock the member assumption's confidence to 0, and re-verdict via the pure engine. One row per
 * DISTINCT building, ordered by entryId. Missing/corrupted buildings are skipped.
 */
export function crackFoundation(entries: LibraryEntry[], foundation: SharedFoundation): CrackResult[] {
  const byEntry = new Map<string, string[]>();
  for (const m of foundation.members) {
    const arr = byEntry.get(m.entryId) ?? [];
    arr.push(m.nodeId);
    byEntry.set(m.entryId, arr);
  }

  const results: CrackResult[] = [];
  for (const [entryId, nodeIds] of byEntry) {
    const entry = (entries ?? []).find((e) => e.id === entryId);
    if (!entry || !graphLooksValid(entry.graph)) continue;
    try {
      const before = integrity(entry.graph);
      const cracked = cloneGraph(entry.graph);
      for (const id of nodeIds) {
        const node = cracked.nodes.find((x) => x.id === id);
        if (node) node.confidence = 0;
      }
      const after = integrity(cracked);
      results.push({ entryId, integrityBefore: before, integrityAfter: after, failed: after < HOLDING_THRESHOLD });
    } catch {
      continue;
    }
  }
  results.sort((a, b) => a.entryId.localeCompare(b.entryId));
  return results;
}

// ── SAMPLE seeding (in-memory, NEVER persisted) ──────────────────────────────
//
// When the library is empty the Skyline still demos: three sample buildings derived from the R/A/B
// context fixtures. To GUARANTEE a shared foundation across samples, the A sample's keystone label
// is ALIASED in-memory to the R sample's real "spare capacity" assumption (see SAMPLE_ALIAS below).
// The production fixtures in src/context/fixtures.ts are NEVER touched — the alias lives only on the
// cloned copy returned here.
//
// The two members of the seeded foundation:
//   • R: node `team_has_backend_capacity` — real fixture label "Six-person team has spare capacity"
//        (the R keystone; cracking it collapses R: 52.63% → 0%).
//   • A: node `k_credible` — ALIASED to "Six-person team has spare capacity" (A's keystone; cracking
//        it collapses A: 61.97% → 0%).
// So cracking the foundation reads "1 ASSUMPTION FEEDS 2 STRUCTURES · 2 COLLAPSE". B shares nothing.
export const SAMPLE_ALIAS = {
  entryNodeId: "k_credible",
  label: "Six-person team has spare capacity",
} as const;

// A fixed timestamp — NEVER a wall-clock read (T8). Samples are ephemeral, so the value is cosmetic.
const SAMPLE_ISO = "2026-07-04T00:00:00.000Z";

function sampleEntry(
  id: string,
  title: string,
  seq: number,
  mode: LibraryEntry["mode"],
  input: LibraryEntry["input"],
  graph: Graph,
): LibraryEntry {
  const key = keystone(graph);
  return {
    id,
    title,
    savedAtISO: SAMPLE_ISO,
    seq,
    mode,
    input,
    companyContext: null,
    pack: null,
    graph,
    verdict: {
      integrity: integrity(graph),
      keystoneId: key?.id ?? null,
      failedIds: [],
      loadApplied: false,
    },
  };
}

/** The A-sample graph with its keystone label aliased so it shares R's "spare capacity" foundation. */
function aliasedGraphA(): Graph {
  const g = cloneGraph(fixtureContextGraph());
  const node = g.nodes.find((n) => n.id === SAMPLE_ALIAS.entryNodeId);
  if (node) node.label = SAMPLE_ALIAS.label;
  return g;
}

/**
 * Three in-memory SAMPLE entries (R / A / B), newest-first. Deterministic, offline, never persisted.
 * The UI seeds these ONLY when the real library is empty and flags them with a SAMPLE chip.
 */
export function sampleSkylineEntries(): LibraryEntry[] {
  return [
    sampleEntry("sample-r", "Excalidraw · build own realtime backend", 3, "R", REAL_CONTEXT_INPUT, cloneGraph(fixtureContextGraphR())),
    sampleEntry("sample-a", "Migrate to microservices", 2, "A", HERO_CONTEXT_INPUT, aliasedGraphA()),
    sampleEntry("sample-b", "Reinforce first — hire 2 SREs", 1, "B", REINFORCE_CONTEXT_INPUT, cloneGraph(fixtureContextGraphB())),
  ];
}
