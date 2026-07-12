---
title: Keystone STUDIO — UI/UX improvement plan (critical audit)
date: 2026-07-07
author: senior product designer (audit deliverable)
scope: /studio (src/app/KeystoneApp.tsx + src/ui/tabs/* + src/canvas/*)
status: VETTED — resolved by orchestrator critique + user decisions (see below); now executing
---

## RESOLVED — orchestrator critique + user decisions (2026-07-07)

The controller judged this audit critically before execution. Changes from the raw audit:

- **G-2 / Open Q1 → resolved (b): fix 2D, keep 2D default.** Do NOT default to 3D. The
  "3D is more legible" evidence is a symptom that **2D is broken**, not that 3D is superior.
  Defaulting to 3D would cede the flat-CAD drawing-sheet identity and pay a ~26MB chunk on
  entry. Invest G-1 so 2D reaches legibility; keep 3D as the lazy opt-in view.
- **G-1 strengthened:** not just node/label scale — add **progressive disclosure** (a 13-node
  board must show fewer things at once, not just bigger things).
- **M-1 mobile reflow: IN SCOPE (user decision "do both").** Stays a real task, executed last
  so the desktop GRAPH/STRESS structure settles first and mobile wraps the final layout.
- **L-1 bumped:** now that the live path is real (keys present), a silently stalled live run is
  a genuine bug, not a nicety.
- **Controller-decided (low risk):** darken `--muted`→`~#6a685f` for label text (A-1);
  compact header timestamp `YYYY-MM-DD · HH:MM`, hidden <640px (X-1/Open Q5); STRESS
  always-visible = VERDICT + attacks + collapse + keystone + Attack-Basis + de-risk, collapse
  Wind Tunnel / Timeline / Support-Breakdown / Re-run (S-2/Open Q3).

### Vetted execution order (source of truth for the build loop)
T1 shell (X-1/2/3) → T2 CONTEXT (C-1/2/3) → T3 GRAPH 2D legibility (G-1/G-3) →
T4 STRESS rail (S-2/S-3) → T5 STRESS canvas (S-1) → T6 surface errors (L-1) →
T7 a11y+motion (A-1/A-2/A-3) → T8 mobile reflow (M-1/M-2). Engine/numbers/provenance off-limits.

---

# Keystone STUDIO — UI/UX Improvement Plan

## Method & evidence

Every finding below is grounded in **real renders** of the running studio, captured with
Playwright (chromium, swiftshader) at **desktop 1440×900** and **mobile 390×844**, across
DESIGN, CONTEXT (before/after ANALYSE + live pipeline overlay), GRAPH (2D PLAN, 2D SECTION,
2D DETAIL, 3D + node selection), and STRESS (before/after APPLY LOAD). Shots in `/tmp/studio-*.png`.

> **Dev-environment note (not an app defect):** the user's dev server on `:3000` was in a
> corrupted `.next` "fallback" build (client chunks + CSS 404, hydration dead, serif fallback,
> clicks inert, API routes 500) — this matches the known "never run `next build` while `next dev`
> runs" gotcha. Per the established NEXT_DIST_DIR protocol I stood up an **isolated agent dev
> server** (`NEXT_DIST_DIR=.next-agent`, port 3002) without touching the user's server or `.next`,
> and captured all renders against it. **The user should restart their own `:3000` dev server**
> (or `rm -rf .next && next dev`) — the studio itself is healthy; only their build cache is stale.

## What is already good — PRESERVE, do not touch

These are wins. The plan below must not regress them.

- **The ledger identity itself** — warm paper, 1px hairlines, UPPERCASE tracked labels, mono
  tabular numerals, zero radius, keystone-red accent. Coherent and distinctive. Keep.
- **The DESIGN tournament** (`d-design-tournament`) — three rival structures, per-card integrity %,
  verdict stamps (COLLAPSED/STANDS/STRESSED), survivor accent, OPEN IN STUDIO. Legible, honest
  ("PINNED — DETERMINISTIC SHOWCASE"), and it *shows* the solver picking a winner. Strong surface.
- **The LivePipeline overlay** (`d-pipeline`) — the 5-stage GATHER→COMPILE→EXTRACT→ATTACKS→SOLVE
  strip with per-stage timing + SKIP, and "DETERMINISTIC SOLVER · LLM PROPOSED THE SHAPE · CODE
  COMPUTES THE VERDICT". Clear, on-brand, and even tolerable on mobile.
- **The 3D graph view** (`d-graph-3d`) — nodes sized by load-bearing, colored by status, legibly
  labelled, keystone callout, and a rich SelectionPanel (type/confidence/support/knock-out/feeds/
  edit/groups). Ironically the **most legible** graph surface in the product.
- **The STRESS left rail as an analytical ledger** (`d-stress-after`) — attack rows with severity +
  rationale, baseline→post-load + integrity drop, failure cascade, knock-out sensitivity with the
  dominance ratio, Context Used facts. This is the substance. Keep the content; only re-prioritize
  its density (see S-2).
- **The empty state** (`EmptyCanvas`) — the hairline keystone-arch wireframe + "AWAITING STRUCTURE"
  + manifesto whisper. Quietly excellent.
- **The deterministic engine and every number it emits** — integrity %, keystone id, sensitivity
  impacts, cascade support, timeline "fails in N days". **Off-limits.** No visual change may alter,
  reorder-for-meaning, or re-derive these; UI only re-presents them.
- **The key-safety boundary & demo rails** — PINNED vs CUSTOM·LIVE labelling, scenario R default,
  the deep-import purity. Do not restructure data flow for cosmetics.

---

## Findings by surface

Ratings: **Impact** (user value) × **Effort** (build cost), each Low/Med/High. Tier = P0 must /
P1 should / P2 nice.

### X · Cross-cutting shell (TopBar / tabs / status strip)

**X-1 · TopBar timestamp collides with the title on mobile; actions overflow. [P0]**
Evidence: every mobile shot — the raw ISO `2026-07-07T13:40:41.802Z` overlaps the "KEYSTONE"
wordmark (`m-context-after`, `m-graph-2d`), and only SKYLINE/FIT/RESET fit — PRINT MEMO and SIGN IN
are pushed off-screen. On desktop the same ISO string **wraps to two lines** (`d-graph-2d`), which
looks broken in a header that prizes precision.
*Why it hurts:* the first thing a judge sees on a phone is a broken header; overflowing actions hide
core controls.
*Change:* (a) render the timestamp as a compact `YYYY-MM-DD · HH:MM` mono stamp, single line, and
**hide it below ~640px**; (b) on narrow widths collapse the action cluster into an overflow "⋯"
menu (SKYLINE / PRINT MEMO / RESET move inside; keep FIT + account visible), or drop the subtitle
first. Preserve all actions — just reflow them.
Impact High × Effort Low.

**X-2 · Five persistent top actions + long subtitle crowd the bar. [P2]**
Even on desktop the header carries wordmark + 60-char subtitle + timestamp + 5 buttons. The
subtitle truncates immediately (`…FI…`).
*Change:* demote the subtitle to the decision title only (drop the "STRUCTURAL ANALYSIS FOR
DECISIONS —" boilerplate, which repeats the wordmark's promise); let it have real width.
Impact Low × Effort Low.

**X-3 · Status strip is a strong idea but the last segment clips on mobile. [P2]**
`STAGE … NODES … LINKS …` truncates after LINKS on 390px (`m-*`). It's the single best "systems are
live" signal — worth keeping visible.
*Change:* allow the strip to become horizontally scrollable (its own `overflow-x:auto`) rather than
clipping, or prioritize Integrity + Keystone + Stage as the always-visible three on narrow widths.
Impact Low × Effort Low.

### C · CONTEXT tab

**C-1 · Agent-gather + Manual are forced side-by-side and get cramped, especially on mobile. [P1]**
`ContextPane` uses `PANE = {display:flex, gap}` (row) for the AgentGather column and the Manual
textarea. On mobile (`m-context-after`) the business-context textarea is a ~150px-wide sliver; on
desktop the left half is mostly empty while the right textarea is fine. The relationship "agent
finds facts → you layer manual context on top" is not visually expressed — they read as two
unrelated columns.
*Why it hurts:* the CONTEXT story (agents gather, you refine) is the product's opening argument and
it reads as a cramped form.
*Change:* stack agent-gather **above** its matching manual textarea in a single column per sub-tab
below a breakpoint (≤900px), and on desktop give the manual textarea the dominant width with the
gather as a labelled evidence rail. Keep the four sub-tabs.
Impact Med × Effort Low.

**C-2 · MODE segmented labels truncate to ambiguity. [P2]**
`R — REAL: EXCALIDRAW` / `A — MIGRATE BEFORE PILOT (COLLAPSES)` etc. render as `R — REAL:…`,
`A — MIGR…` on mobile and narrowish desktop (`m-context-after`). The parenthetical outcomes
(COLLAPSES / HOLDS) — the most interesting part — are the first thing clipped.
*Change:* two-line segments (id + short name on line 1, outcome chip on line 2), or drop the
scenario long-names to a caption under the control. The `PINNED · SCENARIO R` chip already carries
the mode; the segment can be terser.
Impact Low × Effort Low.

**C-3 · CONTEXT-after is indistinguishable from CONTEXT-before. [P2]**
After ANALYSE, returning to CONTEXT shows the same gather form (`d-context-after`); the *result*
(Context Used, the compiled pack) only surfaces on STRESS's right rail. A user who analysed and
came back to CONTEXT gets no acknowledgement that anything happened here.
*Change:* after a run, show a compact "COMPILED — n facts · source PINNED/LIVE" confirmation strip
at the top of CONTEXT (links to the graph), so the tab reflects state. Low-risk, additive.
Impact Low × Effort Low.

### G · GRAPH tab (the flagship "2·GRAPH")

**G-1 · The 2D board (PLAN *and* SECTION) renders nodes far too small; auto-fit wastes ~half the
canvas; labels are unreadable at default zoom. [P0 for the flagship tab]**
Evidence: `d-graph-2d` (SECTION) and `d-graph-plan` (PLAN, *after* pressing FIT) both show 13 nodes
squeezed into the upper-center third with vast empty grid around them; node labels are illegible
without manual zoom. `d-graph-detail` adds evidence text under each node that is microscopic. By
contrast `d-graph-3d` is immediately readable.
*Why it hurts:* the primary tab a user lands on after ANALYSE is the least legible view of the very
thing the product claims to make legible. The structure "looks like decoration," which is the exact
failure mode the manifesto disowns.
*Change (engine-safe — geometry/scale only, never the graph data):*
  1. Fix the default fit — FIT/auto-fit should target ~80% viewport occupancy with sane min node
     size, not the current sparse layout. (The `fitSignal` path exists; the layout/zoom target is
     the bug.)
  2. Raise the minimum node box size and label size so labels are readable at the fitted zoom;
     truncate long labels with ellipsis + full text on hover (the pattern already used elsewhere).
  3. Consider making **the fitted, legible view the default** on entering GRAPH.
Impact High × Effort Med.

**G-2 · Consider defaulting GRAPH to the 3D view, or at least reaching parity. [P1 — needs human
decision]**
The 3D leg is the strongest reading of the graph (G-1 evidence). Today it's a tertiary segment
(PLAN | SECTION | 3D) that users may never find; the default is SECTION, the least legible.
*Change (option, not a unilateral):* either (a) make 3D the default GRAPH view, or (b) invest G-1 so
2D reaches legibility parity and keep 2D default for print/PLAN fidelity. This trades demo wow (3D)
against the ledger's flat-CAD identity — see Open Questions.
Impact High × Effort Low (flip) to Med (parity).

**G-3 · The VIEW/DETAIL/FOCUS control stack is deep and its dependencies are opaque. [P2]**
The left rail carries Graph Ledger → gauge → Filter → **VIEW (PLAN/SECTION/3D) → DETAIL toggle →
FOCUS STRATUM (disabled until DETAIL+SECTION)** → Depth → Assumptions sliders. Section is disabled
in Band 1, focus is disabled unless DETAIL+section+not-3D — a lot of conditional disabling the user
can't predict. The gauge is *also* duplicated (rail ledger integrity + big ring gauge + status-strip
integrity all show 55%).
*Change:* group VIEW as one titled block with inline helper text for why a segment is disabled
(some already exists: "Band 1 · flat plan only"); drop one of the three redundant integrity
read-outs on this tab.
Impact Low × Effort Low.

### S · STRESS tab

**S-1 · The center 2.5D SECTION canvas is cluttered and illegible — the constraint planes read as
overlapping rotated noise. [P1]**
Evidence: `d-stress-after`. LOAD arrows (top) are clear and the gauge crater (10% FAILED) is great,
but the graph nodes are tiny, and the constraint datum-planes appear as **90°-rotated labels jammed
against the right edge** — `6 MET…`, `TYPE…`, `N BACK…`, `TEAM M…`, `MUST SE…`, with `VIOLATED ×1/
×2/×3` stacked vertically. It's the single most visually chaotic region in the product.
*Why it hurts:* the collapse is the money moment; the canvas that should *show* it is the hardest
part to read, undercutting the rigorous rails beside it.
*Change (visual only — the strikes/violations are engine-derived, keep them):* give the constraint
planes horizontal labels in a dedicated top or bottom datum band (not rotated against the frame
edge); apply the G-1 node-scale fix here too; consider offering the 3D collapse view on STRESS as
well (today 3D is GRAPH-only) so users can read the failure in the legible view.
Impact Med × Effort Med.

**S-2 · The left rail is information-overloaded — ~9 stacked panels, long scroll, no hierarchy of
"read this first." [P1]**
`d-stress-after` shows Depth → Attack Ledger → Load Result → Sensitivity → Attack Basis toggle →
buttons → Reinforcement → Timeline → Wind Tunnel → Re-run, all at one visual weight; the "Failure
Cascade · 3 fell" headline is already scrolled off at the fold. Everything here is *good content*
(S-2 is not "delete") but there's no answer to "what's the verdict, in one line."
*Change:* add a compact **VERDICT header** at the top of the rail — one line: "COLLAPSES · keystone
team_has_backend_capacity · 55%→10% · 3 fell" — then let the deep panels follow. Make the
lower-priority interrogation tools (Wind Tunnel, Timeline, Support Breakdown, Re-run) collapsible
(Support Breakdown already is) so the primary story (attacks → collapse → keystone → de-risk) reads
without scrolling. Preserve every panel; only reorder/collapse.
Impact Med × Effort Med.

**S-3 · Attack Basis toggle (IGNORE ⟷ GROUND IN CONTEXT) is the demo's fulcrum but reads as just
another segmented control. [P2]**
This toggle is *the* "context changes the verdict" reveal, buried mid-rail below the sensitivity
bars. 
*Change:* elevate it visually near the VERDICT header (S-2) with a one-line consequence caption
("grounding the same attacks in this decision's context cracks the keystone"). No logic change.
Impact Med × Effort Low.

### M · Mobile (390×844) — the biggest single gap

**M-1 · GRAPH and STRESS are unusable on mobile — fixed 340px + 300px rails don't reflow, the
canvas is pushed off-screen, content is clipped, the page scrolls horizontally. [P0]**
Evidence: `m-graph-2d`, `m-graph-3d`, `m-stress-before` — the left rail (340px) alone nearly fills
a 390px viewport; the center canvas is entirely off-screen; the right rail (SELECTION / CONTEXT
USED / ENCODING) is clipped at the right edge showing half-words (`SELEC…`, `EDGE`, `Bootstrapped
freemiu…`). The 3D scene is **not visible at all** on mobile.
*Why it hurts:* on a phone the tool degrades to a broken horizontal-scroll form with no graph — a
judge opening it on mobile sees nothing work.
*Change:* below a breakpoint (~820px) convert the three-pane GRAPH/STRESS layout into a **stacked,
tabbed single column**: canvas first (full-width, fixed aspect), then a segmented "LEDGER /
SELECTION / CONTEXT" switch that swaps the rail content beneath it. Reuse existing panels verbatim —
this is a layout wrapper, not a rewrite of the panels. Ensure no element has a hard `min-width`
wider than the viewport.
Impact High × Effort Med.

**M-2 · DESIGN tournament is a 3-column grid on mobile. [P2]**
`repeat(3, 1fr)` at 390px yields three ~120px MiniStructures with clipped constraints textarea.
*Change:* single-column stack (or horizontal snap-scroll of the three cards) below ~700px.
Impact Low × Effort Low.

**M-3 · CONTEXT is the mobile bright spot — mostly keep. [note]**
`m-context-after` stacks acceptably and the full-width ANALYSE button is right. Fixing C-1 (stack
agent/manual) is what makes it fully clean on mobile. No separate work.

### L · Loading / error states

**L-1 · A failed analyse/API run fails silently — Stage sticks and no graph ever appears. [P1]**
`analyse()`/`applyLoad()` wrap fetches in try/finally with **no catch that surfaces an error to the
user**; if `/api/context|extract|attacks` errors, the store never gets a graph, the tab may not
advance, and the only signal is the StatusStrip Stage label. (I hit exactly this class of dead-end
when the build was broken — no in-app affordance told me why.)
*Why it hurts:* a live CUSTOM run that errors leaves the user staring at a stalled pipeline with no
recourse.
*Change:* on fetch failure, set an error stage, show a dismissible inline banner ("ANALYSE FAILED —
retry / fell back to fixture"), and re-enable the ANALYSE button. Ledger-styled, `--bad` accent.
Impact Med × Effort Low.

**L-2 · Loading states are otherwise handled well. [note]** The pipeline overlay, "ANALYSING…"
button state, "Loading 3D…" placeholder, and the tournament assemble-under-load animation are all
good. Preserve.

### A · Accessibility

**A-1 · Text contrast on paper is borderline for captions. [P1]**
`--muted (#7a786f)` on `--panel (#fbfaf6)` is ~3.1:1 — under WCAG AA (4.5:1) for the 10–11px
uppercase `.label` text that carries most of the UI's wayfinding (section headers, status strip,
chip labels). At the small tracked sizes used, this is a real legibility issue, not pedantry.
*Change:* darken `--muted` toward `#6a685f`/`--ink-2` for label-sized text, or raise label weight/
size. Verify against the palette; keep the paper aesthetic.
Impact Med × Effort Low.

**A-2 · Custom controls lack visible focus + names. [P2]**
Segmented buttons, the range sliders (`.ledger-range:focus {outline:none}` with no replacement), and
node clicks are mouse-first. `aria-pressed` is present on segments (good), but focus-visible styling
is stripped and the 3D/2D canvases have no keyboard path to select a node.
*Change:* add a hairline `:focus-visible` ring (2px ink, offset) across `.btn`, segments, sliders,
tabs; give sliders `aria-valuetext`; ensure every icon-only control (zoom +/−, fit) has a title/
aria-label (some already do).
Impact Med × Effort Low.

**A-3 · Motion.** `prefers-reduced-motion` is honored for the landing live-dot but the tournament
clock and pipeline beats aren't gated. [P2] Add a reduced-motion path that snaps to end-state.
Impact Low × Effort Low.

### Adjacent surfaces (peripheral to the studio shell)

**P-1 · Connections (MCP) and Account live off the studio at `/account/connections`, reachable only
when signed in; the shell's only entry is "SIGN IN TO SAVE". [note, not scored]**
These are separate routes, not part of the tab flow, and were not renderable in a guest session.
Not a studio-shell defect; flag only that MCP connections are effectively invisible to a first-time
(guest) user — a future "Connections" affordance in the shell might be worth a product decision, but
that's a scope call for the human, not a UI fix.

---

## Ranked execution sequence (what a build loop does first)

Ordered by impact-per-effort and by "what a judge sees break first." Each item is a layout/visual/
copy change; **none touch the engine, the numbers, the demo data flow, or the key-safety boundary.**

1. **X-1 — Fix the mobile/desktop TopBar** (timestamp overlap + action overflow). Cheapest, most
   visible, unblocks every mobile screenshot. *[P0, Low]*
2. **M-1 — Reflow GRAPH & STRESS to a stacked, tabbed single column on mobile.** The largest
   correctness gap; makes the tool exist on a phone. *[P0, Med]*
3. **G-1 — Fix 2D graph auto-fit + node/label scale** so the flagship tab is legible at default.
   *[P0, Med]*
4. **S-2 + S-3 — STRESS rail: add a one-line VERDICT header, elevate the Attack-Basis toggle,
   collapse the deep interrogation panels.** Turns the dense rail into a readable argument. *[P1, Med]*
5. **S-1 — De-clutter the STRESS 2.5D canvas** (horizontal constraint-plane labels + G-1 node scale).
   *[P1, Med]*
6. **L-1 — Surface analyse/apply-load errors** with a dismissible banner + re-enable. *[P1, Low]*
7. **A-1 + A-2 — Contrast on label text + focus-visible rings.** *[P1, Low]*
8. **C-1 — Stack agent-gather over manual in CONTEXT** (fixes desktop emptiness + mobile cramping).
   *[P1, Low]*
9. **G-3 / X-2 / C-2 / C-3 / M-2 / A-3 — Polish tier.** Redundant-gauge trim, terser header/mode
   labels, CONTEXT-after confirmation, mobile tournament stack, reduced-motion. *[P2]*

Decision gate before building: resolve **G-2** (Open Question 1) — it changes whether step 3 targets
2D parity or a 3D-default.

## Open questions / decisions for the human

1. **Default GRAPH view: keep 2D SECTION, or make 3D the default?** (G-2.) 3D is measurably more
   legible but leans away from the flat-CAD "drawing sheet" identity and costs a ~26MB three.js
   chunk on entry. Options: (a) 3D default; (b) fix 2D to parity, keep 2D default; (c) remember the
   user's last choice. A designer shouldn't unilaterally trade the identity or the bundle cost.
2. **Mobile scope for the hackathon.** Is a fully usable phone experience in scope for the demo, or
   is desktop the judged surface? M-1 is real work; if mobile is out of scope, at minimum ship X-1
   and a "best viewed on desktop" honest note rather than a silently broken layout.
3. **How much of the STRESS rail is "always visible" vs collapsed?** (S-2.) Collapsing Wind Tunnel/
   Timeline/Support-Breakdown improves focus but hides depth a judge might want to see live. Which
   panels are load-bearing for the pitch, and which are on-demand?
4. **`--muted` contrast fix vs paper warmth.** (A-1.) Darkening labels is the correct accessibility
   move but slightly cools the "warm paper" feel. Confirm the palette owner is OK with the shift.
5. **Header timestamp semantics.** Is the server `startedAt` meant to read as a precise provenance
   receipt (keep ISO, just don't overlap) or as ambient chrome (compact/hide)? Affects X-1's exact
   treatment.

## Explicitly out of scope / do not touch
- The pure engine and every value it computes; propagation/keystone/sensitivity/cascade/timeline math.
- The PINNED vs CUSTOM·LIVE provenance model and deep-import purity boundary.
- The scenario-R pinned demo flow and its calibrated collapse beats.
- The core ledger visual language (paper, hairlines, mono numerals, zero radius, keystone red).
