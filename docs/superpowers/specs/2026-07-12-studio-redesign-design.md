# Studio Redesign — Clean-Modern Design System

**Date:** 2026-07-12
**Branch base:** `founder-b/keystone-next`
**Direction:** approved from the Graph-tab mockup (clean-modern SaaS — Linear/Vercel/Notion). Soft white cards on a cool canvas, one indigo accent, semantic verdict colors, sans type with mono demoted to numbers, generous whitespace, progressive disclosure.
**Status:** design approved (mockup), spec for review → writing-plans

## Problem

The studio reads as a dense engineering-CAD terminal: mono-everything, hairline grid, tiny uppercase labels, a warm grey-cream palette, sharp corners (`* { border-radius: 0 }`), and both rails packed with competing data. The founder wants it to feel like a modern product a founder trusts at a glance — fixing vibe, clutter, and finish together. The analytical substance stays; only the presentation changes.

## Non-goals / invariants (bind every task)

- **Behavior-preserving.** No change to the engine, store, agents, routes, or any data flow. This is presentation only. All existing `data-testid`s and their semantics stay so the test suite and e2e probes keep passing.
- **Theme-aware.** Ship a real light + dark theme via tokens (the mockup proves both). `prefers-color-scheme` default; if a runtime toggle is added it stamps `:root[data-theme]`.
- **No new hydration hazards.** No `Date.now`/`Math.random`/`new Date(` in client-reachable files.
- **Accessibility kept or improved.** Preserve the `:focus-visible` rings, keep text contrast ≥ WCAG AA (4.5:1 for body/labels), keep reduced-motion handling.
- **No horizontal page scroll.** Wide content (graph, tables, tournament) scrolls inside its own container.
- `vitest` + `npx tsc --noEmit` green each task boundary. Don't stage `tsconfig.json`/`next-env.d.ts`.

## Design tokens (replace in `src/ui/theme.css`)

Keep the existing token **names** so the ~200 inline/class references pick up new values automatically; add new tokens for the new primitives. Light values (dark in the `@media (prefers-color-scheme: dark)` + `:root[data-theme]` blocks — see mockup for the full set):

```
--bg (canvas)   #F5F7FA      --panel (card)  #FFFFFF     --panel-2 (card-2) #FBFCFD
--ink           #14161C      --ink-2         #545C6B      --muted (ink-3)   #8A93A2
--hair (line)   #E7EAF0      --hair-strong (line-2) #DDE1EA
--accent        #4A5AD4      --accent-weak   #EEF0FC      (NEW — the single brand accent)
--ok / --hold   #1F9D57      --hold-weak     #E6F5EC
--warn          #C98A0E
--bad / --keystone / --crack  #E0484D        --bad-bg / --crack-weak  #FCECEC
--thesis        #4A5AD4 (accent)   --claim  #1F9D57 (hold)   --assumption  #8A93A2 (muted)
--radius        10px (NEW — was 0)   --radius-sm 8px   --radius-lg 14px
--shadow-sm     0 1px 2px rgba(20,22,28,.05)
--shadow        0 1px 2px rgba(20,22,28,.04), 0 4px 16px rgba(20,22,28,.05)
--sans  (unchanged next/font Inter stack)     --mono (unchanged JB Mono — now numbers/ids ONLY)
```

**Remove** the global `* { border-radius: 0 }` reset — that single rule forces sharp corners everywhere and fights the new soft look. Components that genuinely need square corners set it explicitly.

## Class restyle (in `src/ui/theme.css`)

- `.panel` → soft **card**: white, `border: 1px solid var(--hair)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow)`.
- `.btn` → sans (not uppercase-tracked), `font-weight: 550`, `border-radius: var(--radius-sm)`, `border-color: var(--hair-strong)`; `.btn-primary` uses `--accent` (not `--ink`). Hover/disabled preserved.
- `.field-input` → sans, `border-radius: var(--radius-sm)`, `:focus` border `--accent`, focus-visible ring `--accent`.
- `.tab` → sans, `font-weight: 550`, not uppercase; `.tab-active` underline + color use `--accent`.
- `.chip` → **pill** (`border-radius: 999px`), sans, softer.
- `.label` → keep as a small uppercase caption BUT lighter tracking (`0.05em`) — still the eyebrow, less shouty; `--muted` color.
- `.section-header` → cleaner eyebrow, `--radius` divider optional; keep as the section caption.
- `.ledger-row` → softer divider (`--hair`), keep for dense number rows but demote from the "signature component" role.
- Focus-visible rings switch from `--ink` to `--accent`.
- React Flow controls (`.keystone-controls`) → rounded (`--radius-sm`), soft border, subtle shadow.

## New shared primitives (in `src/ui/primitives.tsx`)

Add a small, reused vocabulary the tabs compose from (matching the mockup):

- `Card({ children, pad })` — the soft white panel (`.panel` + optional padding).
- `Eyebrow({ children })` — the uppercase section caption (replaces bare `.label` headers).
- `Pill({ tone, children })` — status pill; `tone: "hold" | "warn" | "crack" | "accent" | "neutral"` maps to the weak-bg + strong-fg pairs.
- `Disclosure({ summary, children, open })` — the clean expandable section (chevron rotates), for progressive disclosure. Wraps `<details>`; strips the native marker (already have `.ledger-details`).
- `Gauge({ value, max, tone })` — the radial SVG integrity gauge (from the mockup): track + colored arc + centered value. Pure, deterministic (no Date/random).

Existing primitives (`Button`, `Field`, `Tabs`, `TopBar`, `StatusStrip`, `SectionHeader`, `LedgerRow`, `Chip`, `EmptyCanvas`) get restyled to the new tokens/classes, signatures unchanged.

## Rollout (screen by screen — each independently shippable + verifiable)

1. **Foundation** — `theme.css` tokens + class restyle (remove the radius reset) + the new primitives + restyle existing primitives. This alone cascades the palette/type/rounding/cards app-wide. **Live checkpoint with the founder before proceeding.**
2. **Shell** — `KeystoneApp` top bar + tab nav + page canvas: calmer top bar (brand mark, decision line, minimal actions), underline tabs with accent, spacious padded canvas.
3. **Graph tab** — the hero (matches the mockup): verdict Card (Pill + Gauge + P(hold)/band + keystone callout + Disclosure clusters/structure), graph Card (dotted board, clean rounded nodes, keystone highlighted), context Card (fact lists + Disclosure). Progressive disclosure replaces the packed rails.
4. **Stress tab** — same card language: verdict/attack-basis Card, council-findings + DE-RISK THESE + knock-out sensitivity as clean sections, graph Card (already flat), support-breakdown Card.
5. **Context tab** — agent gather + manual as clean two-column cards; sub-tabs as the new tab style; library as a clean list.
6. **Design tab** — the tournament (three rivals) as soft cards with the verdict pills; keep the reduced-motion handling.

Each screen: reskin layout via cards/whitespace/disclosure, keep every `data-testid`, run `vitest` + `tsc`, drive it live once and screenshot. Foundation + Graph get a founder checkpoint.

## Testing

- The existing UI tests assert on `data-testid`s and text, not on exact styles, so the reskin should keep them green; any test asserting a now-removed structural element is updated in that task (and noted).
- Per surface: `vitest` for the touched files, `tsc` clean, and a live drive (isolated `:3002` server) with a screenshot to confirm the look matches the mockup.
- Theme check: verify light + dark both render legibly on the Graph tab.

## Task decomposition (sequential — shared token/primitive files)

1. **T1 Foundation** — `theme.css` + `primitives.tsx` (tokens, class restyle, remove radius reset, new primitives). Live checkpoint.
2. **T2 Shell** — `KeystoneApp` topbar/tabs/canvas.
3. **T3 Graph tab** — `GraphTab` (+ selection/encoding rail) to the card/gauge/disclosure layout.
4. **T4 Stress tab** — `StressTab` card language.
5. **T5 Context tab** — `ContextTab` + `AgentGather` clean two-column cards.
6. **T6 Design tab** — `DesignTab` tournament cards.

Ledger: `.superpowers/sdd/studio-redesign-progress.md`. Reports namespaced `sr-task-N-report.md`.
