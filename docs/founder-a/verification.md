# Founder A — Verification

Branch: `founder-a/context-core`. Environment: Node v22.23.0, npm 10.9.8, macOS.

## Commands run

| Command | Purpose | Result |
|---|---|---|
| `npm install` | install deps | ✅ ok (added `zod-to-json-schema` — see below) |
| `npx vitest run` (`npm test`) | full unit suite | ✅ **94 passed / 94** (13 files) |
| `npx tsc --noEmit` (`npm run typecheck`) | strict typecheck | ✅ exit 0 |
| `npm run build` (`next build`) | production build | ✅ exit 0 (compiled + static pages generated) |

## Test coverage (86 tests)
- `engine/`: propagation (AND product / OR max / multi-group / leaf / clamp / cycle-throws / unknown-child-safe / integrity), sensitivity (strict winner, tie-break by id, no mutation, clone isolation, null keystone), load (attack compounding, no mutation, unknown-target no-op, threshold + custom threshold), **purity boundary**.
- `llm/`: base fixture schema-valid + keystone `a_arch` + craters; client no-key fallback (base **and** context-pack-aware) for `extractStructure`/`generateAttacks`.
- `context/`: schema validation + malformed-enum/missing-array rejection + `postClamp` + `ContextCompileResult↔ContextCompileOutput` assignability; weights (all category maps incl. `second-order`→execution and `SLA`→reliability, unclassifiable/no-match unchanged, highest-magnitude wins, increase/decrease, clamp, no mutation); **pinned hero fixture** (baseline ≈61.97, keystone `k_credible` ≥5× next, post-load <10, failures `{T,c_exec,c_reliab,k_credible}`, `c_roi` holds); compile no-key fallback + temporal facts + weight increases + decision passthrough; **key-safety boundary**.

## Deviations from the base plan (real-repo contradicted the plan)
1. **Anthropic SDK 0.68.0 has no `messages.parse` and no `@anthropic-ai/sdk/helpers/zod` (`zodOutputFormat`).** Verified against installed `node_modules`. The base plan's exact structured-output call does not exist. **Adapted** to the version-robust pattern: `src/llm/structured.ts` uses `messages.create` with a single **forced tool** (`tool_choice: { type: "tool" }`) whose `input_schema` is the JSON Schema of the zod type (via `zod-to-json-schema`), then validates the returned tool input with the zod schema. Same guarantees (schema-validated JSON, retry once, fixture fallback). Added dependency: `zod-to-json-schema@^3.25.2`. The live path is not unit-tested (no key in CI); the no-key fallback path is fully tested.
2. **`keystone()`/`rankLoadBearing()` shape** kept as base-plan `{ id, label, impact }` (not the brief's `{ assumptionId, impact }`), per "follow the base plan for names." `keystone(g)?.id` gives the node id.
3. **Added `detectFailures(graph, threshold?)`** optional threshold param (superset of the base plan's fixed-threshold version; default `0.35`).
4. **Deterministic tie-break** added to `rankLoadBearing` (`impact desc, then id asc`) so keystone selection is stable under ties (product-AND makes required-AND assumptions tie on impact).

## Founder-B files created by Founder A (minimal, documented)
- `src/app/layout.tsx` — base Next root layout (scaffold requirement).
- `src/app/page.tsx` — **placeholder stub** so `next build` succeeds; commented as Founder B's to replace. No store/UI/canvas/API logic added.

## Lint
No `lint` script is configured. `npm run typecheck` (`tsc --noEmit`, strict) is the static-analysis gate. `next lint` / ESLint were intentionally not added to avoid a broken script and keep the build deterministic; adding ESLint is a Founder B / later choice. (No broken script is left.)

## Remaining limitations / risks
- The **live** Claude path (with a real key) is exercised only by design + typecheck, not by an integration test (no key available in CI). The forced-tool JSON schema is generated at call time; if the live model returns a malformed tool input, zod rejects → retry once → fixture. Demo is safe offline.
- `next build` emits an npm-audit advisory (transitive dev deps); no action needed for the hackathon.
