# ▣ Keystone — a CAD tool for thinking

> *Cognitive CAD: "Can we design thoughts the way engineers design machines? Ideas have
> constraints. Beliefs have dependencies. Plans have load-bearing assumptions. Taste has
> geometry. What would a CAD tool for thinking look like?"*

A CAD tool for thinking treats a decision as a **load-bearing structure**: the LLM proposes the
shape, and a deterministic solver decides whether the structure stands — which assumption is the
keystone, which constraints it violates, and how it fails under load.

Keystone is the full CAD loop — **DESIGN · TEST · ASSEMBLE**:

- **DESIGN** — state a goal; three rival structures are synthesized under different strategy lenses
  and stress-tested under identical load. The solver picks the survivor.
- **TEST** — interrogate the survivor: grounded load, an adversarial **wind tunnel** (two agents
  argue, a deterministic solver referees), and the minimal de-risking plan.
- **ASSEMBLE** — every decision joins the **skyline**; shared foundations reveal which single
  assumption props up multiple structures — where systemic risk hides.

## Manifesto → mechanism

The track names four properties of thought. Keystone renders each as engineering geometry:

| Track line | What Keystone builds |
|---|---|
| **Ideas have constraints** | Context constraints render as CAD **datum planes** the structure sits inside (`RUNWAY ≤ 7 MO`, `SLA 99.9%`). An attack that maps to a constraint **strikes** its plane — a visible collision, marked `VIOLATED ×n`. |
| **Beliefs have dependencies** | The graph is an **AND/OR dependency network**. Support propagates from evidence up through assumptions and claims to the thesis; knock out a support and the loss ripples along the real edges. |
| **Plans have load-bearing assumptions** | A pure solver finds the **keystone** — the single assumption whose removal costs the most integrity — via knockout sensitivity, then computes the **minimal reinforcement set** that heals the structure. |
| **Taste has geometry** | The Z-axis encodes **reasoning depth**, not decoration. Strata descend `L0 THESIS → L1 CLAIMS → L2 ASSUMPTIONS → L3 EVIDENCE`. Grounded assumptions rest on evidence **plates**; ungrounded ones **float** with nothing beneath them. A `DEPTH n/4 · GROUNDED m/k` metric reads the shape as judgment quality. |

The v6 loop adds three mechanics on top of that geometry:

| Mechanic | What Keystone builds |
|---|---|
| **Generative design** | One goal yields **rival candidates** — three structures under different **strategy lenses** (AGGRESSIVE / CONSERVATIVE / HYBRID), stress-tested under identical grounded load. The pure engine ranks them by integrity; the survivor wins. The LLM never ranks. |
| **Wind tunnel** | An **adversarial interrogation** of one structure: a PROSECUTOR agent proposes novel attacks, an ADVOCATE agent counters with evidence, and the pure solver **referees** every round — its verdict cannot be overridden. Agents propose; only the referee moves numbers. |
| **Skyline** | The whole library rendered as one **assembly** — each decision a building, **shared foundations** as columns beneath. Cracking one foundation re-verdicts every structure resting on it, exposing systemic risk. |

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

## Demo script (90 seconds)

1. **DESIGN — type the goal.** In the DESIGN tab, state *"win enterprise collaboration revenue
   without burning the team"* and GENERATE RIVALS. Three structures assemble, then collapse
   **simultaneously** under identical grounded load until one stands. Open the survivor in the studio.
2. **TEST — grounded load.** The `roadmap meeting in 2 days` evidence sharpens the attacks; the
   keystone **cracks**, a constraint plane shows `VIOLATED`, and a causal callout cites a **real
   source**. The solver returns the **minimal** de-risking set that heals it.
3. **TEST — wind tunnel (2 rounds).** PROSECUTOR proposes a novel attack, the solver referees,
   ADVOCATE counters with a pack citation, the solver referees again. The transcript reads
   `PROSECUTOR ▶ / SOLVER ■ / ADVOCATE ◀`; the session clone lands on `STANDS` or `FALLS`.
4. **ASSEMBLE — skyline crack.** Open `/skyline`: every saved decision is a building, shared
   foundations columns beneath. Crack one foundation — the buildings resting on it re-verdict and
   drop: `1 ASSUMPTION FEEDS N STRUCTURES · M COLLAPSE`.

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
