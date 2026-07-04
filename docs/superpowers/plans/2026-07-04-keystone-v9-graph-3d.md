# Keystone v9 — Minimalist/expandable graph, true 3D, landing labels

From founder fixes: (1) reduce verbosity, make the graph much easier to read, expandable, minimalist; (2) add a TRUE 3D view of our graph (react-three-fiber) as an optional toggle; (3) fix the landing page graph labels.
Decisions: minimalism = progressive disclosure + strip chrome (no new agent); 3D = real react-three-fiber of OUR decision graph as a view option.

## Wave 1 (parallel, disjoint)

### V9-1 · Minimalist, expandable graph (declutter + progressive disclosure)
- [ ] `src/canvas/StructuralNode.tsx`: node shows MINIMAL by default — short label + a small integrity/keystone dot; the confidence number, evidence plate, quantities, rationale, source excerpt are HIDDEN until the node is expanded (click to expand/collapse, or expand the selected node). Keep the keystone glow + failed/crack states. Much less text on the board at rest.
- [ ] `src/canvas/KeystoneCanvas.tsx`: declutter — the constraint rail, stratum L0–L3 labels, force arrows, and dense overlays become TOGGLEABLE (default to a clean minimal board; a small "DETAIL" / layer toggle reveals them). Thin the edges, calmer grid. Reduce simultaneous on-screen text.
- [ ] `src/ui/tabs/GraphTab.tsx`: a clean VIEW control that will host PLAN / SECTION (existing) and later 3D (V9-2); a DETAIL toggle for the chrome; keep zoom controls. The ledger/rail stays but trimmed of low-value rows.
- [ ] Verbosity: audit the GRAPH surface for redundant labels/rows and cut. Keep it deterministic; keep T10/canvas tests green (retarget deliberately where the default-hidden change moves assertions).
- Files: src/canvas/{StructuralNode,KeystoneCanvas}.tsx, src/ui/tabs/GraphTab.tsx, canvas tests.

### V9-3 · Landing graph labels (isolated)
- [ ] Fix the unreadable/broken labels in the landing graph visuals — `src/landing/MiniStructure.tsx` / `src/ui/MiniStructure.tsx` (whichever the landing hero + SystemAtWork use) + `src/landing/MiniCollapseHero.tsx` + `src/landing/SystemAtWork.tsx`. Labels must be legible (size, truncation, no overlap, no clipping). Screenshot-verify the landing.
- Files: src/landing/**, src/ui/MiniStructure.tsx (only if landing-owned rendering).

## Wave 2 (after V9-1 — plugs into the reworked VIEW control)

### V9-2 · True 3D view (react-three-fiber)
- [ ] Add deps: `three`, `@react-three/fiber`, `@react-three/drei`. Client-only (dynamic import with ssr:false — no SSR/hydration).
- [ ] New `src/canvas/Keystone3D.tsx`: render the decision graph in real 3D — nodes as 3D objects positioned on the depth strata (thesis high → evidence low, reuse depth.ts elevations + dagre x/y mapped to 3D), edges as lines, keystone highlighted, failed nodes styled; OrbitControls (rotate/zoom/pan). Deterministic layout; labels as billboards/drei Text or html. Reads the same graph/keystone/failures the 2.5D canvas uses (standing structure on GRAPH per the earlier fix).
- [ ] GraphTab VIEW control gains a **3D** option alongside PLAN/SECTION; selecting it swaps the board for Keystone3D. Lazy-load so the 3D bundle only loads when chosen.
- [ ] Keep offline/deterministic; no wall-clock/random; e2e must still pass (3D leg optional — at minimum the app builds and 2.5D still works; if headless WebGL is unavailable in CI, guard the e2e to not require WebGL).
- Files: src/canvas/Keystone3D.tsx (new), src/ui/tabs/GraphTab.tsx, package.json, tests.

## Gates (every item)
vitest green · tsc clean · NEXT_DIST_DIR=.next-gate build 0 · npm run e2e PASS (:3002) · demo beats/fixtures preserved · no client wall-clock/random. Push at wave boundaries.

## Deviations
(append)
