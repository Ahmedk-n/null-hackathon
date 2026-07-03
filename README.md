# ▣ Keystone — a CAD tool for thinking

> *Cognitive CAD: "Can we design thoughts the way engineers design machines? Ideas have
> constraints. Beliefs have dependencies. Plans have load-bearing assumptions. Taste has
> geometry. What would a CAD tool for thinking look like?"*

A CAD tool for thinking treats a decision as a **load-bearing structure**: the LLM proposes the
shape, and a deterministic solver decides whether the structure stands — which assumption is the
keystone, which constraints it violates, and how it fails under load.

## Manifesto → mechanism

The track names four properties of thought. Keystone renders each as engineering geometry:

| Track line | What Keystone builds |
|---|---|
| **Ideas have constraints** | Context constraints render as CAD **datum planes** the structure sits inside (`RUNWAY ≤ 7 MO`, `SLA 99.9%`). An attack that maps to a constraint **strikes** its plane — a visible collision, marked `VIOLATED ×n`. |
| **Beliefs have dependencies** | The graph is an **AND/OR dependency network**. Support propagates from evidence up through assumptions and claims to the thesis; knock out a support and the loss ripples along the real edges. |
| **Plans have load-bearing assumptions** | A pure solver finds the **keystone** — the single assumption whose removal costs the most integrity — via knockout sensitivity, then computes the **minimal reinforcement set** that heals the structure. |
| **Taste has geometry** | The Z-axis encodes **reasoning depth**, not decoration. Strata descend `L0 THESIS → L1 CLAIMS → L2 ASSUMPTIONS → L3 EVIDENCE`. Grounded assumptions rest on evidence **plates**; ungrounded ones **float** with nothing beneath them. A `DEPTH n/4 · GROUNDED m/k` metric reads the shape as judgment quality. |

## The honest architecture claim

- **The LLM proposes structure; the solver decides integrity.** Extraction turns a decision into
  a graph; a **pure, deterministic engine** (no model, no randomness, no wall-clock) computes
  integrity, keystone, constraint violations, and the reinforcement set. The LLM **cannot override
  the solver** — it only supplies structure to analyze.
- **Every live path falls back to a pinned fixture.** Context, extraction, and attacks each run
  live when `ANTHROPIC_API_KEY` is present and otherwise replay pinned outputs. The API routes
  never 500; each stage reports its true `live | fixture` source.
- **The offline demo works fully, keyless.** With no key, the entire flow is deterministic and
  identical every run.

## Scenario R — generated live against a real project

R is not a toy. It was produced by **actually running the pipeline** against
[github.com/excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) and
[excalidraw.com](https://excalidraw.com) — real repo, real site, real competitors
(tldraw / FigJam / Miro) — for the decision *"Should Excalidraw build a paid realtime-collaboration
backend now?"*. The live findings (real file paths and URLs, clickable provenance) were captured
and **pinned as fixtures**, so R replays deterministically offline while every citation is real.

R baseline integrity **52.6%**, keystone `team_has_backend_capacity`, 5 constraint planes,
evidence coverage **6/6**.

## Demo script (60 seconds)

1. **R → Analyse.** Strata assemble on the canvas; grounded assumptions land on evidence plates,
   the ungrounded one floats.
2. **Apply Load (raw).** Attacks hit the structure; integrity drops to **15.8%** but the keystone
   **holds**.
3. **Ground in Context.** The `roadmap meeting in 2 days` evidence sharpens the attack (0.50 → 0.70):
   the keystone **cracks**, a constraint plane shows `VIOLATED`, and a causal callout cites a **real
   source**.
4. **Reinforce.** The solver returns the **minimal** set of supports; the structure heals.
5. **Timeline.** A `FAILS IN N DAYS` readout dates the collapse.

## How to run

```bash
npm i
npm run dev     # http://localhost:3000 — offline demo works with no key
npm test        # unit + engine + UI suites (vitest)
npm run e2e      # scripted rehearsal, 0 console errors
```

`ANTHROPIC_API_KEY` in `.env.local` is **optional** — it enables the live gather chain and the
judge-typed **CUSTOM** mode (drop the scenario pin, watch the real chain fire). Without it,
everything runs from pinned fixtures. Model: `claude-opus-4-8`.
