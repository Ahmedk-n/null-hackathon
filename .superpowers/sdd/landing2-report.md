# Landing hero redesign (V9) — report

**Status:** DONE. tsc clean · vitest green (691/691, 1 skipped) · `npm run build` exit 0 (`/` still statically prerendered ○, 11.1 kB).

## New hero layout
- **Two-column, above the fold** (`.hero-grid`, `minmax(0,1.04fr) / minmax(0,0.96fr)`):
  - **LEFT** — eyebrow, tightened headline (kept "Find the one assumption your decision **can't survive without.**" with the red clause), a cut-down subhead, OPEN STUDIO (`/studio`) + SIGN IN (`/login`) CTAs, then the CONTEXT→STRUCTURE→STRESS→KEYSTONE pipeline chips.
  - **RIGHT** — a framed **terminal viewport** (`.term-viewport`): hairline border + soft drop shadow, a `.term-header` status row (pulsing `LIVE` dot · `REAL SOLVER` · mono `migrate to microservices`), then the live `MiniCollapseHero` with its prominent INTEGRITY gauge — the structure stands, craters under load, keystone cracks, then De-risk restores, right in the hero.
- On ≤940px the grid collapses to a single stacked column (copy → panel); the hero fills the full width now instead of hugging a 620px left rail.
- **Depth:** a low-contrast **blueprint grid** (`.blueprint-grid`) sits behind the hero — 26px minor + 130px major hairlines via `color-mix` on `--hair`/`--hair-strong`, radial-masked so it fades to the warm paper at the edges.
- **Terminal chrome:** a thin top **status strip** using the server `startedAt` ISO (`SESSION …`) + `PINNED FIXTURE` / `REAL SOLVER` chips.
- Below the fold (SystemAtWork, How it works, Manifesto, Vocabulary, Honest architecture, closing CTA, RecentDecisions) is unchanged, now in a reopened 960px reading-width container with clean top spacing.

## MiniCollapseHero responsiveness (the mobile clip fix)
Added an opt-in **`fit` prop** to the shared `MiniStructure` (default off → zero change for the tournament / pipeline / stress callers). In `fit` mode the fixed 700×340 stage is wrapped in a CSS **container-query** box (`container-type: inline-size`) with `aspect-ratio: 700/340`, and the inner coordinate space is scaled by `transform: scale(calc(100cqw / 700px))` from the top-left. So the hand-placed nodes scale to exactly fill the column — no clipping, no horizontal page scroll at 390px, keystone + thesis + collapse all visible. The integrity gauge/status strip stays full-size and legible. `MiniCollapseHero` threads `fit` + a `style` passthrough so the hero frames it borderless inside the term-viewport (avoids a double border). Verified `/studio` DESIGN/STRESS/pipeline usages untouched (their MiniStructure calls omit `fit`).

## Hard constraints held
- No `Date.now`/`Math.random`/`new Date(` in any client file; `startedAt` still server-stamped in `src/app/page.tsx`. `/` remains static/prerenderable.
- `src/landing/Landing.test.tsx` still green as-is (headline, pipeline, CTAs, mini-hero testid all still present) — no test edit was required.
- Files touched: `src/landing/Landing.tsx`, `src/landing/MiniCollapseHero.tsx`, `src/ui/MiniStructure.tsx`, `src/ui/theme.css`.
