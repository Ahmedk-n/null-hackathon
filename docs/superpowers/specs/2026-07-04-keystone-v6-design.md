# Keystone v6 — DESIGN · TEST · ASSEMBLE (spec)

**Approved:** 2026-07-04 (brainstorm session). **Priority:** Generative → Tunnel → Skyline. Landing/explanations are never-cut.
**The reframe:** Keystone stops being a stress-tester and becomes the full CAD loop for thinking: *generate* rival structures, *interrogate* the survivor, *assemble* every decision into one load-bearing system.

## New vocabulary (extends the v5 domain model — must appear in the landing vocabulary ledger and in-app microcopy)

- **Rival candidates** — alternative Structures for the same goal, synthesized under different strategy lenses and stress-tested under identical grounded load. The survivor wins.
- **Strategy lens** — the stance a candidate is generated under: AGGRESSIVE (speed/upside), CONSERVATIVE (de-risk first), HYBRID (staged).
- **Wind tunnel** — an adversarial interrogation of one Structure: a PROSECUTOR agent proposes novel attacks, an ADVOCATE agent counters with evidence; the pure solver referees every round and cannot be overridden.
- **Shared foundation** — an assumption that appears (by deterministic label similarity) in more than one saved decision; a load-bearing column under multiple buildings. Cracking it re-verdicts every structure resting on it.
- **Skyline** — the whole library rendered as one assembly: every decision a building, shared foundations beneath.

## 1 · Generative Decision Design (V6-1)

**Tabs become 0·DESIGN → 1·CONTEXT → 2·GRAPH → 3·STRESS.** (T9's "exactly 3 tabs" contract is deliberately retargeted to 4 — same precedent as the T10 tilt retarget.)

- **DesignTab** (`src/ui/tabs/DesignTab.tsx`): GOAL textarea + CONSTRAINTS textarea, an explainer line ("GENERATIVE DESIGN — three rival structures for the same goal, stress-tested under identical load; the solver picks the survivor"), GENERATE RIVALS button, and the tournament view.
- **API**: `POST /api/design {goal, constraints, pack?, scenario?}` → `{candidates: [{lens, label, graph, attacks}], source}` + `x-keystone-source` header. Server (`src/llm/design.ts`): three extractions in parallel (Promise.all), one per strategy lens — the existing extract prompt + a lens stanza; each through GraphSchema + validateGraph; attacks per candidate via the existing generateAttacks path with the same pack (comparable by construction: same categories, same reweight, same severity wall). Any candidate failing → its pinned fixture stand-in (never fewer than 3 candidates, never 500). Scenario or no key → pinned candidates.
- **Verdicts are computed client-side by the pure engine** (raw + grounded integrity per candidate) — the LLM never ranks.
- **Pinned showcase**: `scripts/generate-design-r.mjs` runs the live path once against scenario R's goal ("win enterprise collaboration revenue without burning the team") and pins 3 candidates as `fixtureDesignCandidatesR` (same recipe as scenario R: live provenance, hand-calibrated severities allowed and documented). The demo default.
- **Tournament view**: 3 side-by-side **MiniStructure** renders (extract the landing hero's purpose-built mini renderer into a shared `src/ui/MiniStructure.tsx`; landing hero refactors to consume it). On GENERATE: all three assemble, then collapse SIMULTANEOUSLY under their grounded attacks; verdict stamps by integrity band (✓ STANDS ≥35 · ⚠ STRESSED 10–35 · ✗ COLLAPSED <10); survivor accented. Deterministic stagger, no wall-clock/random.
- **OPEN IN STUDIO** on the survivor (or any candidate): seeds the store (setGraph + attacks as rawAttacks; pack if present), auto-saves to library, jumps to GRAPH tab.

## 2 · Adversarial Wind Tunnel (V6-2)

- Lives in the STRESS tab: a **WIND TUNNEL** section, enabled when `loadApplied && applyContextWeights`.
- **Session isolation**: the tunnel runs on a CLONE of the working graph rendered as a MiniStructure beside the transcript; the main verdict is untouched (no reset semantics, no demo risk).
- **Rounds (max 5)**: PROSECUTOR proposes one novel attack `{targetId, category, severity, rationale}` → **pure referee** `applyTunnelRound` (`src/context/tunnel.ts`) validates (target exists + is an assumption, category normalises, severity clamped ≤0.6, no duplicate target across rounds) and the engine recomputes → ADVOCATE counters `{kind: "restore"|"rebuttal", targetId?, value, citation}` (restore ≤ the node's baseline confidence; rebuttal ≥ 0.5× the attack's severity; citation must reference a pack fact/evidence source) → engine recomputes. Agents PROPOSE; only the referee moves numbers.
- **Streaming**: `POST /api/tunnel` (SSE, same shape as /api/gather): `round` → `proposal` → `verdict` → `counter` → `verdict` … → `done {verdict: "STANDS"|"FALLS", holds, cracks}`. Live path: two lightweight agents on the proven pattern (messages.create, 30s timeout, retryOnce; transcript threaded into each prompt). Scenario/no-key → a scripted 5-round fixture duel for scenario R (authored, deterministic, replayed with the same event cadence as gather fixtures).
- **UI**: transcript ledger (role-tagged rows: PROSECUTOR ▶ / SOLVER ■ / ADVOCATE ◀), live integrity readout for the session clone, final stamp `STANDS (3 HOLDS / 2 CRACKS)`. Explainer line: "WIND TUNNEL — two agents argue; the solver referees. Its verdict cannot be overridden."

## 3 · The Skyline (V6-3)

- **Route `/skyline`** (client page), linked from the studio TopBar ("SKYLINE") and the landing.
- **Pure module** `src/lib/skyline.ts`: `buildSkyline(entries: LibraryEntry[])` → `{buildings: [{entryId, title, integrity, nodeCount}], foundations: [{label, members: [{entryId, nodeId}], count}]}`. Shared-foundation matching: deterministic token-set similarity on assumption labels (lowercase, stopword-strip, Jaccard ≥ 0.5) — no LLM. `crackFoundation(entries, foundation)` → per-building re-verdict via pure engine knockout (confidence 0 on the member node).
- **Render**: SVG skyline — one building per entry (height ∝ nodeCount, integrity-band glow, .mono nameplate), shared foundations as labeled columns beneath spanning their members. Click a foundation → CRACK IT → members re-verdict, failed buildings drop/dim, readout "1 ASSUMPTION FEEDS N STRUCTURES · M COLLAPSE". RESET restores.
- **Empty library**: seed 3 SAMPLE-chipped entries derived from the R/A/B fixtures (in-memory, not persisted) so the view always demos. Zero LLM; fully offline.

## 4 · Landing + explanation layer (V6-4 — never cut)

- **HOW IT WORKS** becomes the DESIGN → TEST → ASSEMBLE arc (3 ledger steps rewritten): 1·DESIGN (state the goal; three rival structures are synthesized and stress-tested; the solver picks the survivor) → 2·TEST (interrogate it: grounded load, wind-tunnel cross-examination, de-risking plan) → 3·ASSEMBLE (every decision joins the skyline; shared foundations reveal systemic risk).
- **Vocabulary ledger** gains RIVAL CANDIDATES · STRATEGY LENS · WIND TUNNEL · SHARED FOUNDATION · SKYLINE (definitions from this spec, one line each).
- Landing gains a VIEW SKYLINE link beside ENTER STUDIO. README updated to the new arc.
- **In-app microcopy rule**: every new surface carries its one-line explainer (DesignTab, Wind Tunnel section, Skyline header) — no unexplained mechanics anywhere.

## Invariants & testing

All existing guardrails hold (fixtures win under scenario; offline keyless demo fully works; engine pure — tunnel referee lives in src/context; never 500; no client wall-clock/random; model claude-opus-4-8; NEXT_DIST_DIR gate builds). Tests: pure-module units (design fixtures pinned, tunnel referee validation table, skyline matcher + crack), route tests (design/tunnel scenario short-circuits), UI renders, T9 retarget to 4 tabs. e2e gains DESIGN-tournament, TUNNEL-replay (fixture), and SKYLINE-crack legs.

## Error handling

Design: any lens failing live → pinned stand-in candidate (mixed sources labeled per-candidate LIVE/CACHED chips). Tunnel: any agent failure mid-duel → remaining rounds replay from fixture, transcript notes "AGENT UNAVAILABLE — SCRIPTED CONTINUATION". Skyline: corrupted library entries skipped (existing tolerance).
