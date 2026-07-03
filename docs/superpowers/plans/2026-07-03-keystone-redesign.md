# Keystone — Redesign Plan (Ledger UI · Agentic Context · 3D-Adaptive Graph)

**Date:** 2026-07-03 · Branch: `founder-b/context-ui` (Founder B) · Engine frozen, context/llm core = Founder A (sample stubs today).
**Trigger:** the current dark, rounded UI reads as a toy. This plan replaces the presentation layer with a professional **terminal/CAD ledger** aesthetic (per the reference), adds **agent-driven context aggregation** (clone & analyse the repo for technical context; crawl site + competitors for business context) with manual overrides, and upgrades the graph to a genuinely **3D-feeling adaptive-dimensionality** canvas.

> **Decisions locked (change here if wrong):**
> - **Theme = LIGHT ledger** (matches the reference exactly): warm paper background, hairline grid, uppercase tracked labels, monospace numerals. Not dark.
> - **Agent execution = in-process server-side Claude agentic loops** under `/api/gather` (tool_runner), streamed to the client via SSE. Offline (no `ANTHROPIC_API_KEY`) → scripted fixture events. Not Managed Agents (keeps it local, offline-safe, zero infra).
> - **Engine untouched** (frozen, pure). All new work is Founder-B product/server surface + one new `src/agents/` module. Context/llm stays A's.

---

## 1. Design language (extracted from the reference)

A single, disciplined system. Encode it once in `src/ui/theme.css` (CSS variables + utility classes) and a `src/ui/tokens.ts` mirror; every component consumes it.

### 1.1 Tokens

```css
:root {
  /* paper + ink */
  --bg:            #f5f4ef;   /* page */
  --panel:         #fbfaf6;   /* raised panel */
  --panel-2:       #efeee8;   /* inset / header row */
  --ink:           #1a1a15;   /* primary text */
  --ink-2:         #45443d;   /* secondary text */
  --muted:         #7a786f;   /* labels / captions */
  --hair:          #d8d5cc;   /* 1px borders (the grid) */
  --hair-strong:   #b7b3a7;   /* section dividers */

  /* semantic accents (desaturated to fit paper) */
  --thesis:        #2c4a76;   /* blue */
  --claim:         #2f6b64;   /* teal */
  --assumption:    #6f6d64;   /* grey */
  --keystone:      #b23a2e;   /* red */
  --increase:      #a9741a;   /* amber (weight ▲ / temporal) */
  --decrease:      #7a786f;   /* grey (weight ▼) */
  --ok:            #3c7a3a;   /* integrity high / HOLDING */
  --warn:          #a9741a;   /* integrity mid */
  --bad:           #b23a2e;   /* integrity low / FAILED */

  /* type */
  --sans: "Inter", "Söhne", -apple-system, "Helvetica Neue", Arial, sans-serif;
  --mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* rhythm */
  --row-h: 34px;  --gap: 14px;  --pad: 14px;  --radius: 0;  /* sharp corners */
}
```

### 1.2 Rules (non-negotiable, these ARE the aesthetic)

- **Zero border-radius.** Everything is rectangles bounded by `1px solid var(--hair)`. The whole screen reads as a grid of hairline cells.
- **Labels:** `font-family: var(--sans)`, `text-transform: uppercase`, `letter-spacing: .08em`, `font-weight: 600`, `font-size: 11px`, `color: var(--muted)`.
- **Values / numerals / ids / timestamps:** `font-family: var(--mono)`, `font-variant-numeric: tabular-nums`, `color: var(--ink)`. Timestamps are ISO-8601 (`2026-07-03T22:31:00Z`).
- **Ledger row** (the signature component): `display:flex; justify-content:space-between; height:var(--row-h); border-bottom:1px solid var(--hair);` label left (uppercase), value right (mono, tabular). Reusable as `<LedgerRow label value accent?>`.
- **Section header:** uppercase muted label with a `border-bottom:1px solid var(--hair-strong)` under it (e.g. `GRAPH LEDGER`, `FILTER`, `SELECTION`, `ENCODING`).
- **Buttons:** flat, rectangular, uppercase, hairline-bordered; hover = `background:var(--panel-2)`; primary action = `background:var(--ink); color:var(--bg)`.
- **Controls:** native `<select>`/`range`/checkbox restyled minimally to hairline rectangles (thin track, square thumb).
- **No shadows in chrome.** Depth/shadow is reserved for the 3D graph nodes only (§4).

---

## 2. Information architecture — tabbed, terminal layout

One persistent shell (top bar + bottom status strip) with **three primary tabs**. Left rail + right panel persist and re-content per tab.

```
┌ TOPBAR ───────────────────────────────────────────────────────────────────────────┐
│ ▣ KEYSTONE   DECISION: "migrate to microservices"   2026-07-03T22:31:00Z   [FIT][RESET] │
├───────────────────────────────────────────────────────────────────────────────────┤
│ TAB BAR:   [ 1 · CONTEXT ]   [ 2 · GRAPH ]   [ 3 · STRESS ]      SOURCE: fixture ⚠   │
├──────────────┬──────────────────────────────────────────────────┬───────────────────┤
│ LEFT RAIL    │  MAIN (per active tab)                            │  RIGHT PANEL      │
│ (ledger +    │                                                  │  (contextual)     │
│  controls)   │  CONTEXT → agent gather + manual editor          │  CONTEXT: source  │
│              │  GRAPH   → 3D adaptive canvas                     │   ledger + legend │
│              │  STRESS  → apply load + attack ledger + collapse  │  GRAPH: SELECTION │
│              │                                                  │   (node detail)   │
│              │                                                  │  STRESS: CONTEXT  │
│              │                                                  │   USED + keystone │
├──────────────┴──────────────────────────────────────────────────┴───────────────────┤
│ STATUS STRIP:  NODES 9 · LINKS 8 · KEYSTONE k_credible · INTEGRITY 62% · MODE 2.5D    │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Tab 1 — CONTEXT (agent gather + manual)

Sub-tabs (inner tab strip): `BUSINESS · TECHNICAL · TEMPORAL · DECISION`. Each pane = **two columns**:

- **Left: AGENT GATHER.** A source input + `RUN AGENT` button, and a live **AGENT LOG** ledger that streams the agent's progress (SSE). When done, it writes a `SUMMARY` and a **FINDINGS** ledger (each row `label · value · source`).
  - TECHNICAL source: `REPO URL` (e.g. `github.com/org/repo`) + optional `BRANCH`. Agent clones (shallow) into a temp dir and explores it (list/read/grep, capped) → emits stack, architecture, infra, integrations, tests/CI, tech-debt signals, team-size hint.
  - BUSINESS source: `WEBSITE URL` + `COMPETITORS` (comma-sep URLs/names) + optional `NOTES`. Agent uses web search/fetch → stage, industry, customers, revenue model, competitors, strategic goals, bottlenecks, market constraints.
  - TEMPORAL source: `NOTES / AGENDA` paste (meetings, deadlines) → agent/LLM extracts `UpcomingEvent[]` + `Deadline[]` + urgency. (Optional source: paste calendar text.)
- **Right: MANUAL.** A monospace textarea pre-filled with the agent SUMMARY, editable — the user layers manual context on top ("also: our biggest competitor just raised", "board meeting moved to Friday"). This textarea is what flows into `ContextInput` for the existing compile pipeline.

A single **ANALYSE** button (bottom of the tab, or top bar) runs the pipeline: `POST /api/context` (using the four manual textareas, now agent-seeded) → `setContext` → `POST /api/extract` → graph → auto-switch to Tab 2.

### 2.2 Tab 2 — GRAPH (3D adaptive canvas)

- **Main:** the React Flow canvas in a **perspective container** (§4) — the structural assembly, tilted, layered, with depth.
- **Left rail = GRAPH LEDGER:** live metrics like the reference — `NODES`, `LINKS`, `ASSUMPTIONS`, `CLAIMS`, `INTEGRITY`, `KEYSTONE`, `LAYOUT MODE`, `WEAKEST ASSUMPTION`, plus a `FILTER` block (search by label, min-confidence slider, toggle "show failed only"). Purely presentational reads of engine outputs.
- **Right panel = SELECTION:** click a node → its detail ledger (`TYPE`, `CONFIDENCE`, `SUPPORT`, `KNOCK-OUT IMPACT`, `FEEDS` list) + `ENCODING` legend (color chips: thesis/claim/assumption/keystone/load-path/support-edge).

### 2.3 Tab 3 — STRESS (load + collapse)

- **Main:** the same canvas, now with the `APPLY LOAD` action and the staggered collapse; the integrity gauge sits prominently (top-right of main).
- **Left rail = ATTACK LEDGER:** each generated attack as a row (`CATEGORY · SEVERITY · target`), sortable by severity; a `RESET` and `REINFORCE` action.
- **Right panel = CONTEXT USED:** the `DecisionContextPack` bound directly — business/technical/**temporal** facts + "HOW THIS CHANGED THE ANALYSIS" (weight adjustments, magnitude-sorted, referencing the meeting) + `MISSING INFORMATION` + the `⚠ demo fallback` chip when `source==="fixture"`.

---

## 3. Agentic context aggregation

### 3.1 Module & boundary

New **`src/agents/`** (server-only, Founder B). Never imported by any `"use client"` file — enforced by the existing key-safety boundary test (extend it to also forbid importing `@/agents/*` and `@anthropic-ai/sdk` client-side).

```
src/agents/
  types.ts          # GatherKind, GatherSource*, GatherFindings, AgentEvent
  schemas.ts        # zod mirrors (findings validated at the boundary)
  technical.ts      # gatherTechnical(source, emit): clone+explore repo → findings
  business.ts       # gatherBusiness(source, emit): web search/fetch → findings
  temporal.ts       # gatherTemporal(source, emit): parse notes → events/deadlines
  fixtures.ts       # scripted AgentEvent[] + fixture findings per kind (offline)
  index.ts
  *.test.ts
```

### 3.2 Data contracts (`src/agents/types.ts`)

```ts
export type GatherKind = "technical" | "business" | "temporal";

export interface GatherFinding { label: string; value: string; source: string; } // source = provenance (file path / url / "web")
export interface GatherFindings {
  kind: GatherKind;
  summary: string;                 // pre-fills the manual textarea → ContextInput
  facts: GatherFinding[];          // rendered in the FINDINGS ledger
  raw?: Record<string, unknown>;   // optional structured extras
}

export type AgentEvent =
  | { type: "status"; message: string; ts: string }
  | { type: "finding"; finding: GatherFinding; ts: string }
  | { type: "error";  message: string; ts: string }
  | { type: "done";   findings: GatherFindings; source: "live" | "fixture"; ts: string };

export interface TechnicalSource { repoUrl?: string; branch?: string; notes?: string; }
export interface BusinessSource  { website?: string; competitors?: string[]; notes?: string; }
export interface TemporalSource  { notes: string; }
```

`ts` values are **passed in by the caller/route**, never generated inside a pure module or a `"use client"` file (no `Date.now()` — hydration + determinism). The route stamps them.

### 3.3 The agents

Each `gather*` takes `(source, emit: (e: AgentEvent) => void)` and returns `Promise<GatherFindings>`; it calls `emit` as it works so the route can stream. All fall back to `fixtures.ts` on no-key/error and never throw.

- **`technical.ts`** — with a key: shallow `git clone --depth 1` into an OS temp dir; build a repo digest (dir tree capped ~200 entries, `package.json`/`pyproject.toml`/`go.mod`/`requirements.txt`, README head, presence of `Dockerfile`/CI/`tests`), then a Claude `tool_runner` loop with a **scoped tool set** — `list_dir(path)`, `read_file(path)`, `grep(pattern)` all sandboxed to the clone dir, `max_iterations` ~8 — that lets the model dig where it wants and finally emit a `TechnicalContext`-shaped digest. `emit("status", "cloning …")`, `emit("finding", …)` per discovery, `emit("done", …)`. Clone dir removed in `finally`. **Security:** path args resolved and confined to the temp dir (reject `..`/symlinks/absolute-outside); clone timeout; size cap.
- **`business.ts`** — Claude with Anthropic **server tools** `web_search_20260209` + `web_fetch_20260209` over `website` + `competitors`, producing `BusinessContext` facts with URL provenance. (Server tools run on Anthropic infra — no local browser.)
- **`temporal.ts`** — one `messages.parse` call turning the notes into `UpcomingEvent[]`/`Deadline[]`/urgency (no external tools). Cheapest of the three.

### 3.4 Route (SSE) — `POST /api/gather`

```ts
// body: { kind: GatherKind, source: TechnicalSource|BusinessSource|TemporalSource }
// response: text/event-stream of AgentEvent JSON lines (data: {...}\n\n)
```
The route creates a `ReadableStream`, calls the matching `gather*` with an `emit` that enqueues `data: ${JSON.stringify(event)}\n\n`, and closes on `done`. Offline (no key): replays `fixtures.ts` scripted events with small delays so the log animates. The **client** consumes with `fetch` + a stream reader (or `EventSource` via a GET variant) — never importing `@/agents/*`.

### 3.5 How gather feeds the existing pipeline

Gather is **additive and upstream**: its `summary` seeds the manual textarea; the user edits; **ANALYSE** then runs the *unchanged* `/api/context → /api/extract → /api/attacks` flow. The engine, `compileContext`, `reweightAttacksByContext` are all untouched. This keeps the deterministic core and the whole offline demo intact.

---

## 4. 3D-adaptive dimensionality (the graph)

Adopt the adaptive model verbatim: `pickLayoutMode(nodeCount)` → `simple-2d` (≤8) / `layered-2-5d` (9–25) / `clustered-zoom` (26+). Dagre (`rankdir:"BT"`) computes x/y in all bands; dimensionality changes **styling + a real CSS 3D transform**, never the solve.

**Band 2 (hero) — real 3D feel, not just shadows:**
- Wrap the React Flow viewport in a **perspective container**: `perspective: 1400px;` and tilt the board `transform: rotateX(14deg) rotateZ(-2deg)` (gentle isometric). A `TILT` toggle in the GRAPH ledger flattens it to 0° for readers who prefer flat.
- **Elevation by layer via `translateZ`:** assumptions `translateZ(0)`, claims `translateZ(28px)`, thesis `translateZ(56px)`; keystone `+18px` and a red rim-light. Each node keeps `transform-style: preserve-3d` and a soft contact `box-shadow` that grows with Z → genuine stacked-plates depth.
- **Parallax on hover:** hovered node lifts (`translateZ(+16px)`) and its edges brighten.
- **Collapse (STRESS):** staggered bottom-up (assumption→claim→thesis) `rotateX`/`y`-drop/`translateZ`-sink + opacity + crack overlay (already built) — under perspective it reads as the structure physically buckling toward the viewer.
- **Edges:** support edges thin grey; keystone load-paths red + animated dashes; on collapse, failed edges snap/fade.

**Band 1:** perspective off (flat 2D), plain node styling. **Band 3:** cluster nodes by `WeightCategory`; render collapsed group cards (count + worst integrity), click to expand into the Band-2 view. Band-3 is stretch; falls back to Band-2 layered if unfinished.

Depth cues are pure CSS keyed off `data.type`/`data.layer`/`data.isKeystone` on the existing `StructuralNode`; the perspective wrapper lives in `KeystoneCanvas`. No new library (React Flow + framer-motion suffice).

---

## 5. Component inventory (Founder B; engine/context/llm untouched)

**New**
```
src/ui/theme.css                # tokens + utilities (imported in layout)
src/ui/tokens.ts                # TS mirror of accents for inline styles
src/ui/primitives.tsx           # LedgerRow, SectionHeader, Button, Field, Select, Tabs, StatusStrip, TopBar, Chip
src/ui/tabs/ContextTab.tsx      # sub-tabs + AgentGather + ManualEditor
src/ui/tabs/GraphTab.tsx        # graph ledger + canvas + selection
src/ui/tabs/StressTab.tsx       # attack ledger + canvas + context-used
src/ui/AgentGather.tsx          # source inputs + RUN AGENT + AGENT LOG + FINDINGS ledger
src/ui/SelectionPanel.tsx       # node detail ledger + encoding legend
src/agents/**                   # §3
src/app/api/gather/route.ts     # §3.4 (+ route.test.ts)
src/lib/useAgentStream.ts       # client hook: POST /api/gather, read SSE, collect events (fetch-only, no server imports)
```

**Modified**
```
src/app/layout.tsx              # import theme.css, set --sans/--mono, apply --bg
src/app/KeystoneApp.tsx         # becomes the shell: TopBar + Tabs + StatusStrip + active tab; keeps analyse()/applyLoad orchestration
src/canvas/KeystoneCanvas.tsx   # perspective wrapper + TILT + node click → selection; layer/Z data
src/canvas/StructuralNode.tsx   # translateZ elevation, rim-light, parallax hover (restyle to ledger tokens)
src/ui/IntegrityGauge.tsx       # restyle to ledger (mono %, hairline ring)
src/ui/ConfidenceSlider.tsx     # restyle to hairline control
src/ui/LoadPanel.tsx            # becomes the ATTACK LEDGER (rows, sort)
src/ui/ContextUsedPanel.tsx     # restyle to ledger; keep binding
src/store/useKeystone.ts        # + selectedNodeId + setSelectedNode; + gather-seeded context inputs if we store them; + activeTab
src/store/boundary.test.ts      # extend guard: forbid @/agents/* and @anthropic-ai/sdk in client/store
```

**Untouched:** `src/engine/**`, `src/llm/**`, `src/context/**` (context types/compile/weights/fixtures — A's; `reweightAttacksByContext` still the only pure context import in the store).

---

## 6. Goals

1. The app **looks like the reference** — a professional terminal/CAD ledger (light paper, hairline grid, uppercase labels, mono numerals, ledger rows, top bar + status strip). No rounded toy chrome.
2. **Tabbed** workflow: CONTEXT → GRAPH → STRESS, persistent shell, contextual left rail + right panel.
3. **Agent-gathered context**: a technical agent clones & analyses a repo; a business agent crawls site + competitors; both stream a live AGENT LOG and produce a FINDINGS ledger + summary; the user layers manual context on top; ANALYSE runs the unchanged deterministic pipeline. Works offline via scripted fixtures.
4. **3D-feeling adaptive graph**: Band-2 perspective assembly with layered `translateZ` elevation, parallax, and a staggered 3D collapse; `TILT` toggle; `pickLayoutMode` drives the band.
5. **Everything still deterministic & offline-safe**: engine decides integrity/keystone/failures; no key required for a full demo; no client console errors (the fixed hydration/loop stays fixed).
6. Judging: **coolness** (a 3D decision structure buckling under agent-grounded stress), **technical complexity** (real solver + agentic repo/web analysis + adaptive geometry), **creativity** (a terminal for founder decisions grounded in your actual codebase, site, competitors, and calendar).

---

## 7. Testing metrics (measurable exit gates)

| ID | Metric | Target |
|----|--------|--------|
| **T1** | `npx vitest run` | 100% pass; total tests ≥ **65** (grow from 49) |
| **T2** | `npx tsc --noEmit` | 0 errors |
| **T3** | `npm run build` | exit 0; `/api/gather` route emitted |
| **T4** | Client console errors across the full flow (load → gather → analyse → apply load) | **0** errors / **0** React warnings (headless check counts `console.error`/`console.warn`; manual fallback if no browser) |
| **T5** | Offline gather SSE (`/api/gather`, no key) | emits ≥1 `status` + terminal `done`; `done.findings` validates against `GatherFindingsSchema`; `done.source==="fixture"`; first event < **2s** |
| **T6** | Full offline HTTP chain (`/api/gather`→seed→`/api/context`→`/api/extract`→`/api/attacks`) | all 200, all schema-valid, 9-node `k_credible` graph, integrity craters engine-computed <10% |
| **T7** | Key-safety boundary guard | green; no `"use client"`/`src/store/**` file imports `@/agents/*`, `@/context/compile`, `@/llm/client`, `@anthropic-ai/sdk`, or reads `ANTHROPIC_API_KEY` |
| **T8** | Hydration safety | no `Math.random`/`Date.now`/`new Date(` in any `"use client"` file (grep test); `selectFailures` referential-stability test stays green |
| **T9** | Design conformance (automated DOM test, React Testing Library) | TopBar renders title + ISO timestamp; TabBar renders exactly 3 primary tabs; ≥1 `.ledger-row` present; numerals use the `.mono` class; computed `border-radius` on a panel === `0px` |
| **T10** | Adaptive dimensionality | `pickLayoutMode` unit (existing) + render test: with the 9-node graph the canvas wrapper carries a `perspective` style and Band === `layered-2-5d`; TILT toggle removes/adds the rotate transform |
| **T11** | Agent findings quality (with key, manual/rehearsal) | technical agent returns ≥5 facts each with a real file-path/url `source`; business agent returns ≥5 with url provenance |
| **T12** | Performance (qualitative, rehearsal) | tab switch < 100ms; collapse animation smooth; no layout thrash |

**Machine-verifiable gates (loop must not exit until green):** T1, T2, T3, T5, T6, T7, T8, T9, T10. **Human/rehearsal gates:** T4 (if no headless browser), T11, T12.

---

## 8. Phased task breakdown (loop iterations)

- **Phase R1 — Design system + shell.** `theme.css`, `tokens.ts`, `primitives.tsx` (LedgerRow/SectionHeader/Button/Field/Select/Tabs/TopBar/StatusStrip/Chip); restyle `layout.tsx`; refactor `KeystoneApp` into the tabbed shell (tabs can render placeholder panes). Gate: T2, T3, T9 (partial), existing tests green.
- **Phase R2 — Graph 3D + restyle.** Perspective wrapper + `translateZ` elevation + parallax + TILT in `KeystoneCanvas`/`StructuralNode`; restyle gauge/slider; GRAPH tab ledger + SELECTION panel + node-click selection in store. Gate: T10, T2, T3.
- **Phase R3 — Agentic context.** `src/agents/**` (types, schemas, technical/business/temporal, fixtures), `/api/gather` SSE route, `useAgentStream` hook, `AgentGather` UI, CONTEXT tab (sub-tabs + manual editor seeded by summary). Extend boundary guard. Gate: T5, T6, T7, T1.
- **Phase R4 — STRESS tab + polish + verify.** Attack ledger, restyle ContextUsedPanel, status strip wiring, reveal sequencing; full-flow console-error sweep; all metrics. Gate: T1–T10 green.

Each phase: TDD where the surface is logic (agents, schemas, store, layout), component/DOM tests for UI conformance, then `tsc`+build+targeted vitest, then commit on `founder-b/context-ui` with the co-author trailer. Small, frequent commits.

---

## 9. Guardrails & non-goals

- **Engine frozen.** No edits to `src/engine/**`; it alone computes integrity/keystone/failures.
- **Key only server-side** (`src/app/api/**`, `src/agents/**`, `src/llm|context` compile). Enforced by the boundary test.
- **Offline-safe always.** Every agent + LLM call: validate → retry once → fixture fallback → never throw. Rehearse network-off.
- **No** persistence, auth, multi-decision history, real Band-3 clustering unless time remains, Managed-Agents infra, arbitrary shell (technical agent tools are scoped read-only to the clone dir).
- **Don't retune** `src/llm/fixture.ts` or the context fixtures; the context hero stays `k_credible`.
- **Sample-A files** keep their "replace on merge" headers; agent gather does not depend on A's real core landing.
