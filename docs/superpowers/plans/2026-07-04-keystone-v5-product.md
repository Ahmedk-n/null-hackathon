# Keystone v5 — Landing + product-level features

**Set:** 2026-07-04 ~03:30, from a grilling session. **Exit:** all V5 items [x], gates + e2e green.
**Priority (cut line):** Landing > Memo > Editing > Library. Hackathon-first; every feature keeps a product seam.

## Domain model (ubiquitous language — use these words everywhere: UI, code, docs)

- **Decision** — the thesis under analysis; the root of a Structure.
- **Structure** — the dependency graph (thesis → claims → assumptions) the solver stands up or collapses. What CAD calls the *model*.
- **Keystone** — the load-bearing assumption: max knockout-sensitivity impact.
- **Integrity** — thesis support ×100; the verdict number. HOLDING ≥35 / STRESSED 10–35 / FAILED <10.
- **Stratum (L0–L3)** — reasoning depth layer: THESIS / CLAIMS / ASSUMPTIONS / EVIDENCE. DEPTH = strata present + grounding coverage.
- **Evidence plate** — a source-fact plate hanging below a grounded assumption. Ungrounded assumptions float.
- **Constraint plane** — a context constraint as a CAD datum frame; attacks matching its category STRIKE it → VIOLATED ×n.
- **Load / Attack** — severity-weighted stress on an assumption; context grounding reweights severities.
- **De-risking plan** — the provably-minimal set of assumptions to restore so the Structure survives (reinforcement).
- **Memo (drawing sheet)** — the printable engineering-sheet artifact of one analysis.
- **Library** — persisted analyses (localStorage snapshot per Analyse; backend seam later).
- **Studio** — the working app (/studio). **Landing** (/) explains the concept.
- **Scenario** — a pinned deterministic sample (R real-Excalidraw · A collapses · B holds) vs **CUSTOM** (live chain).
- Provenance states: **GROUNDED** (evidence) / **UNGROUNDED — ASSUMED** (LLM) / **MODIFIED — UNVERIFIED** (human-edited).

## Wave 1 (parallel, disjoint files)

### V5-1 · Landing page at /, studio at /studio ✅ (all 7 sections; hero = purpose-built 12s tick-loop, real engine numbers 62→6→51, no store/motion/RF; RecentDecisions seam typed for V5-4; e2e landing leg added, studio legs retargeted; shell.test unchanged — it renders KeystoneApp directly; 301/301, e2e PASS)
- [ ] `src/app/page.tsx` becomes the landing (server component shell + client hero); app moves to `src/app/studio/page.tsx` (same props: startedAt ISO from server, decision).
- [ ] Sections, terminal/CAD aesthetic throughout (hairlines, zero radius, mono, paper):
  1. **Nameplate**: ▣ KEYSTONE — STRUCTURAL ANALYSIS FOR DECISIONS + track quote ("Can we design thoughts the way engineers design machines?…" full manifesto lines as a ledger).
  2. **Live mini-collapse hero**: auto-playing loop — small structure assembles → load applies → keystone cracks → de-risking heals → reset (~12s cycle). Build with LOCAL state + the pure engine on the pinned hero fixture (do NOT mutate the global keystoneStore from the landing); reuse canvas components if clean, else a purpose-built mini SVG that reuses the visual language (cracks, glow, gauge). Deterministic timing (no Math.random/Date.now).
  3. **HOW IT WORKS**: 3 numbered ledger steps — 1·CONTEXT (agents gather evidence: repo, web, calendar) → 2·GRAPH (LLM proposes the Structure; every confidence grounded or flagged) → 3·STRESS (the deterministic solver applies load, finds the Keystone, prescribes the De-risking plan).
  4. **Vocabulary ledger**: KEYSTONE · INTEGRITY · STRATA/DEPTH · EVIDENCE PLATE · CONSTRAINT PLANE · DE-RISKING PLAN — one-line definitions from the domain model above.
  5. **Honest architecture panel**: "THE LLM PROPOSES THE SHAPE. A PURE DETERMINISTIC SOLVER DECIDES WHETHER IT STANDS. THE LLM CANNOT OVERRIDE THE SOLVER." + offline/fixture guarantee + scenario R provenance line.
  6. **ENTER STUDIO** CTA (big, plus a secondary "OPEN THE REAL SAMPLE — EXCALIDRAW").
  7. Placeholder DECISIONS ledger section (recent analyses — wired by V5-4; render empty-state now: "NO ANALYSES YET — ENTER THE STUDIO").
- [ ] Migrate: e2e/rehearsal.mjs (goto /studio), shell.test/route tests that assume /; T9 contract (TopBar ISO timestamp etc.) applies to the STUDIO page.
- Files: src/app/page.tsx, src/app/studio/page.tsx, src/landing/** (new), e2e/rehearsal.mjs, affected tests.

### V5-2 · Decision memo — engineering drawing sheet ✅ (server page stamps startedAt — T8-clean; SPA Link preserves the store; blocks: verdict banner → sensitivity → de-risking → constraint register → evidence register → timeline → attack ledger → title block; @media print A4; provenance helper pre-wired for V5-3's modified state; 6 tests)
- [ ] PRINT MEMO action in the studio TopBar (enabled when a verdict exists) → opens `/studio/memo` (client route reading the live store; if store empty → "NO ANALYSIS — RETURN TO STUDIO").
- [ ] Sheet layout (print-optimized, @media print clean, A4): **title block** (bottom-right, CAD-style: decision title, ISO date from server-passed startedAt, scenario/source, INTEGRITY stamp with status word, SHEET 1/1, drawn-by KEYSTONE v0.1) · thesis + verdict banner · KNOCK-OUT SENSITIVITY table · DE-RISKING PLAN (minimal set, before→after) · CONSTRAINT REGISTER (planes + VIOLATED states) · EVIDENCE REGISTER (assumption → fact → source, provenance states) · FAILS-IN-N-DAYS line · attack ledger.
- [ ] window.print() button on the sheet ("PRINT / SAVE AS PDF"). No new deps.
- Files: src/app/studio/memo/page.tsx + src/ui/memo/** (new), KeystoneApp TopBar button, tests (render with store populated + empty).

### V5-3 · Graph editing — inspector-panel CAD  ← cuttable only if the night collapses
- [ ] Store actions (src/store/useKeystone.ts, additive): `renameNode(id,label)`, `setNodeConfidence` (exists as setConfidence — reuse), `deleteNode(id)` (cascade: remove from groups; dependents warning data), `addAssumption(parentClaimId,label,confidence)` (id slugified, unique), `flipGroupKind(nodeId,groupIndex)` (AND↔OR). EVERY structural action: (a) runs the edit on a clone, (b) re-validates with the validation-wall rules relaxed for manual edits (acyclic, one thesis, no orphans; node count 3–25), rejects invalid with a store-level `editError` surfaced as a chip, (c) RESETS the stress verdict (clear attacks/loadApplied/reinforcementPlan/timeline — back to baseline integrity), (d) marks the touched node `provenance: "modified"` → renders MODIFIED — UNVERIFIED (SelectionPanel + evidence plate detaches).
- [ ] SelectionPanel EDIT section (studio GRAPH tab): rename field, confidence slider (exists), DELETE (with "N dependents will be orphaned→re-wired to parent" note), ADD ASSUMPTION (on claims), AND↔OR toggle per group. Terminal styling.
- [ ] The solver re-verdicts live after every edit (integrity/keystone/sensitivity update immediately — that's the CAD moment).
- [ ] Tests: each action (happy + rejected-invalid), stress-reset on structural edit, MODIFIED provenance, keystone recompute after edit.
- Files: src/store/useKeystone.ts (+test), src/ui/SelectionPanel.tsx (+test), src/llm/validate.ts (export a relaxed manual-edit variant or parametrize caps), GraphTab if plumbing needed.

## Wave 2 (after V5-1 + V5-3 land — touches store + landing)

### V5-4 · Decision library — auto-save + ledgers  ← first to cut
- [ ] Auto-save on every successful Analyse (and update on Apply Load/reinforce): snapshot {id, title=decision, startedAtISO (server-passed — NEVER client Date), mode/scenario, input, pack, graph, verdict summary {integrity, keystone, failed}} → localStorage (versioned key `keystone.library.v1`, capped 20 entries FIFO).
- [ ] Studio: LIBRARY drawer/section (ContextTab rail or TopBar) — reopen (restores full snapshot into store + mode), duplicate, delete.
- [ ] Landing: DECISIONS ledger section lists recent 5 (title, integrity stamp, keystone, date) — click → /studio?open=<id> restores it.
- [ ] Client-timestamp rule: use the server-rendered startedAt prop + a per-session monotonic counter for ordering; no Date.now()/new Date( in client files (T8 guard stays green).
- [ ] Tests: save/restore round-trip, cap/FIFO, corrupted-entry tolerance (bad JSON → skipped, never crashes).
- Files: src/lib/library.ts (new, +test), src/store wiring, src/landing ledger, ContextTab/KeystoneApp touchpoints.

## Invariants (unchanged)
Scenario fixtures always win; offline keyless demo works; engine pure (editing lives in store/UI, engine only re-runs); never 500; no client wall-clock/random; NEXT_DIST_DIR gate builds; e2e must pass end-of-wave (updated for /studio).

## Deviations
(append here)
