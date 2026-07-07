# Landing below-the-fold polish (landing3)

**Status:** DONE. `/` still prerenders static (`○`), hero untouched.

## What changed (`src/landing/Landing.tsx`)

1. **Manifesto → inverted editorial band.** Dropped the weaker "Can we design
   thoughts…" opener. The four heart lines (*Ideas have constraints. / Beliefs
   have dependencies. / Plans have load-bearing assumptions. / Taste has
   geometry.*) now sit on an `--ink` background in large mono, each on its own
   hairline-separated row with a muted index. It builds to the payoff question
   *"What would a CAD tool for thinking look like?"* set big/bold in paper behind
   the single keystone-red vertical rule (the one red accent).

2. **Vocabulary (12-term jargon) → "How to read a structure" legend.** Cut all
   internal jargon (STRATA/DEPTH, EVIDENCE PLATE, CONSTRAINT PLANE, LOAD/ATTACK,
   DE-RISKING PLAN, RIVAL CANDIDATES, STRATEGY LENS, WIND TUNNEL, SHARED
   FOUNDATION, SKYLINE). Replaced with the six essentials in plain English, each
   with a color chip matching the node colors: THESIS (blue), CLAIM (teal),
   ASSUMPTION (grey), KEYSTONE (red), INTEGRITY (green/--ok), LOAD (amber/--warn).
   Lighter chip+line layout, auto-fit grid, no h-scroll at 390px.

3. **Declutter.** Merged "The whole system, one loop" + "How it works" into a
   single "How it works — one loop" section (SystemAtWork animation + the 3-step
   DESIGN/TEST/ASSEMBLE arc, each body cut to one sentence). Collapsed the
   "Honest architecture" section into one compact trust line above the footer
   ("Deterministic engine — the model proposes; a pure solver decides… runs fully
   offline").

Removed unused `MANIFESTO`/`VOCAB`/`VocabRow`; hero, status strip, MiniCollapseHero
untouched. Updated `Landing.test.tsx` for the new markup.

## Verification
- `npx tsc --noEmit` → clean (exit 0)
- `npx vitest run` → 690 passed / 1 skipped
- `npm run build` → exit 0, `/` static (`○`)
