# Founder A — Repo Scout

**Date:** 2026-07-03 · Branch: `founder-a/context-core` (off `main`)

## Starting state (verified)

The repo was **greenfield** — only `docs/` was tracked before this workstream. No `package.json`, no `src/`, no build tooling. Verified via `git ls-files` and `find` for all config/lockfiles (empty).

### Actual tree at start
```
null-hackathon/
├── docs/
│   └── superpowers/
│       ├── plans/
│       │   ├── 2026-07-03-keystone.md                 # base build plan (1,812 lines, exact code)
│       │   └── 2026-07-03-keystone-context-layer.md   # context-layer plan (this workstream's spec)
│       └── specs/
│           ├── 2026-07-03-keystone-design.md          # design spec
│           ├── keystone-example-graph.svg             # healthy hero graph reference
│           └── keystone-example-graph-collapsed.svg   # collapsed hero graph reference
└── (no code)
```

- **Package manager:** npm (Node v22.23.0, npm 10.9.8). No lockfile existed → npm chosen (matches base plan).
- **Existing source files:** none.
- **Relevant docs:** the two plans + design spec above are the architecture contract.

## Conflicts between docs and reality
- None in the code (greenfield). The two aspirational structures in the briefs disagree on naming; **the base plan wins** per instructions:
  - Store is `src/store/useKeystone.ts` (not `useKeystoneStore.ts`).
  - Engine files are `types/propagation/sensitivity/load/index.ts` (not `graph/evaluate/applyLoad/cascade`).
  - `Attack.category` is a **free string** (not an enum).
  - `keystone()` / `rankLoadBearing()` return `{ id, label, impact }` (base plan), NOT `{ assumptionId, impact }` (Founder A brief §5). Per "follow the base plan," Founder A uses `{ id, label, impact }`; semantics preserved. Fixture tests pin `keystone(...)?.id === "k_credible"`.

## What Founder A must create
- Scaffold: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.local.example`, `.gitignore`.
- `src/engine/**` (pure deterministic engine + tests + purity boundary test).
- `src/llm/{schemas,fixture,client,reinforce}.ts` + tests.
- `src/context/{types,schemas,weights,fixtures,compile,index}.ts` + tests.
- `docs/founder-a/**` execution notes.

## What Founder A must NOT touch (Founder B)
- `src/store/useKeystone.ts`, `src/app/api/**` route handlers, `src/app/KeystoneApp.tsx`, `src/ui/**`, `src/canvas/**`.

## Minimal Founder-B files created for a valid scaffold (documented, to be replaced by B)
- `src/app/layout.tsx` — base scaffold (Next requires a root layout).
- `src/app/page.tsx` — **placeholder stub** so `next build` succeeds; clearly commented as Founder B's to replace. Rationale recorded in `verification.md`.
