# Landing hero redesign — report

**Status:** COMPLETE. `tsc --noEmit` clean · `vitest run` 690 passed / 1 skipped · `npm run build` exit 0 (`/` prerenders static, 10.9 kB).

**Branch:** `founder-b/context-ui` (untouched `main`).

## The new hero
Headline: **"Find the one assumption your decision can't survive without."** — the last clause ("can't survive without.") is set in keystone red so the load-bearing idea reads at a glance. Subhead names the product as a CAD tool for hard calls and walks the value prop: agents pull your real business/technical/temporal context → engine builds a **load-bearing structure** → stress-tests under grounded load → surfaces the **keystone** (the one assumption that collapses everything if wrong). CTAs: **Open Studio** (primary → `/studio`) and **Sign in** (secondary → `/login`), mirrored in the header nav.

**Visual / motion idea:** a four-beat hairline `PipelineStrip` — **CONTEXT → STRUCTURE → STRESS → KEYSTONE** (last cell in red) — states "how it works" in one line, then the existing `MiniCollapseHero` runs directly beneath it as the hook: the real solver on the pinned "migrate to microservices" fixture assembles the structure, grounded load **craters** the integrity gauge as the keystone **cracks**, then the De-risking plan restores it. A "REAL SOLVER · PINNED FIXTURE" tag and a narrating caption sell that every number is the live engine's output.

## What changed
- `src/landing/Landing.tsx` — rebuilt the top into a proper HERO (eyebrow, clamp()-sized headline, subhead, pipeline strip, CTAs, framed live animation). Added header nav CTAs (Sign in / Open Studio), moved the manifesto below the fold, added a closing CTA panel (Enter Studio / View Skyline / Open real sample) and a session-stamp footer. Reused `theme.css` tokens + `SectionHeader`; kept the shared `MiniCollapseHero`/`SystemAtWork` intact.
- `src/ui/theme.css` — added a small `@media (max-width: 620px)` block (`.landing-3col` → single column, `.landing-hide-narrow`) so the landing stays single-column with no horizontal scroll on phones.
- `src/landing/Landing.test.tsx` — re-pointed assertions at the new markup: hero headline, CONTEXT/STRUCTURE/STRESS pipeline, "Open Studio" → `/studio`, new "Sign in" → `/login`, kept skyline + real-sample + manifesto + vocab + how-it-works + hero-mount + empty-state checks.

## Constraints honored
- No `Date.now`/`Math.random`/`new Date(` added; `Landing` is a server component and `MiniCollapseHero` was not touched, so hydration stays clean (`/` still prerenders static).
- Routes intact (`/studio`, `/login`, `/skyline` all verified present). Ledger aesthetic preserved (hairlines, uppercase tracked labels, mono numerals, zero radius, warm paper).

## Deviations / notes
- The `MiniCollapseHero` stage keeps its fixed 700-wide coordinate space (shared renderer, hand-tuned coords). On very narrow phones the rightmost assumption clips inside the panel's `overflow:hidden` (no horizontal scroll) — pre-existing behavior; the keystone (far left) + thesis (center) + the collapse remain visible. Left as-is to avoid touching the renderer shared with the studio tournament.
- Eyeball with `npm run dev` → `/`.
