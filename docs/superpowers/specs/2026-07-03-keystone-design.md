# Keystone — Design Spec

*Cognitive CAD track submission. "Fusion 360 for the decisions your company is about to make."*

**Date:** 2026-07-03
**Track:** Cognitive CAD — "What would a CAD tool for thinking look like?"

---

## 1. One-Line Pitch

> Every big technical or strategic decision is secretly resting on one or two assumptions nobody stress-tested. **Keystone** finds the one that — if it's wrong — takes everything down with it, *before* you bet the company on it.

Keystone is a CAD tool for reasoning. You describe a decision your startup or tech company is weighing; Keystone decomposes it into a **cognitive assembly** — a load-bearing structure of claims and assumptions — then lets you do two things a diagram fundamentally cannot:

1. **Tune it (parametric):** drag any assumption's confidence and watch support re-propagate through the whole structure in real time.
2. **Stress it (FEA):** apply adversarial "load" and watch the structure buckle, the **Structural Integrity** gauge crater, and the single **keystone assumption** crack and light up red.

---

## 2. Why This Wins the Judging Criteria

| Criterion | How Keystone scores |
| --- | --- |
| **Coolness (wow factor)** | A decision you typed in *physically collapses* on screen under adversarial load; a live integrity gauge drops 90% → 34% mid-pitch; the one fatal assumption cracks red. Visceral and unexpected. |
| **Technical Complexity** | A real deterministic solver — support propagation over a DAG + knock-out sensitivity analysis to rank load-bearing members. The LLM only *proposes structure and attacks*; **code decides**. This separation is the headline technical claim. |
| **Creativity** | Nobody has built structural/finite-element analysis for reasoning. It is a literal, non-metaphorical translation of a CAD capability (parametric solve + FEA) onto thought — exactly what the track asks for. |

---

## 3. Core Metaphor & Domain

**Domain:** strategic and technical choices in startups & tech companies.

A decision is a thesis in disguise: *"we should do X"* is a claim resting on load-bearing assumptions. Examples the tool handles:

- *"We should migrate to microservices."* → rests on *"our scaling pain is architectural, not organizational."*
- *"We should raise now instead of bootstrapping."* → rests on *"this market has a closing window."*
- *"We should go PLG instead of sales-led."* → rests on *"our product is simple enough to sell itself."*
- *"We should build this in-house rather than buy."* → rests on *"this is core IP, not a commodity."*

**Load types** (the categories the adversarial LLM attacks from):

- Market reality
- Competitor moves
- Execution risk
- Second-order effects
- Opportunity cost (the "what you're NOT doing" attack — especially potent for decisions)

**Naming:** primary candidate **Keystone** (the wedge-stone that holds an arch up — remove it and the arch collapses; it *is* the load-bearing assumption). Alternates: *Loadbearing, Crux, Truss*. Final name chosen before submission; not architecturally significant.

---

## 4. The Engine (technical core — pure, deterministic, testable)

**Design principle stated to judges: the LLM proposes, deterministic code decides.**

### 4.1 Data Model — a DAG

- **Assumption** (foundation / leaf node): has `confidence ∈ [0,1]` — how solid it is on its own.
- **Claim** (intermediate node): derives support from its dependencies.
- **Thesis / Decision** (root node): the choice being evaluated; sits on top.
- **Edge**: a support dependency from a child (supporter) to a parent (supported).
- **Dependency group**: each parent's incoming edges are grouped as **AND** (all required) or **OR** (any one suffices). A parent may mix groups.

### 4.2 Support Propagation (parametric physics)

For a node `n` with own confidence `c(n)` and dependency groups `G`:

```
support(n) = c(n) × aggregate(G)
```

- **AND-group** aggregate = product of member supports (strict; models "every leg must hold").
  - (min is an acceptable alternative; product chosen because it punishes multiple weak legs, which reads better in the demo.)
- **OR-group** aggregate = max of member supports.
- Multiple groups on one node combine by product (all groups must contribute).
- Leaf assumptions have no dependencies: `support = confidence`.

`Structural Integrity = support(thesis) × 100%`, rendered live on the gauge.

Evaluation order: topological sort of the DAG; recompute is O(V+E) so parametric slider drags update instantly client-side.

### 4.3 Load-Bearing Analysis (the FEA / "real solver" part)

For each assumption `a`:

1. **Knock it out:** set `c(a) = 0`.
2. Recompute `support(thesis)`.
3. `impact(a) = baselineIntegrity − knockedOutIntegrity` (the drop).

Rank assumptions by `impact`. The highest-impact assumption is the **keystone**. This is a deterministic sensitivity analysis over the graph — provable and unit-testable (known graph → known ranking).

### 4.4 Applying Load

The LLM returns attacks; each attack targets one assumption and carries `severity ∈ [0,1]`. Applying an attack lowers the target's confidence:

```
c'(a) = c(a) × (1 − severity)
```

After applying the active attack set, recompute the whole graph. Any node whose `support` falls below a **failure threshold** (default `0.35`, tunable) is marked **failed**; its dependents that lose required support cascade into failure too. The canvas animates this cascade.

### 4.5 Cascade / Collapse Rule

A node "collapses" (visually falls away) when it fails **and** it belongs to an AND-group of a parent, removing required support so the parent also fails. OR-group members failing only collapse the parent if *all* OR members fail. This gives realistic partial-collapse behavior rather than all-or-nothing.

---

## 5. The LLM Layer (exactly three responsibilities)

Everything not listed here is deterministic code.

1. **`extractStructure(decisionText) → Graph`**
   Decompose the user's decision into thesis, claims, assumptions, dependency edges (with AND/OR grouping), and *initial confidence estimates*. Returned as validated JSON via structured output / tool-use.

2. **`generateAttacks(graph) → Attack[]`**
   For each assumption, produce the strongest *realistic* risk drawn from the load-type categories, plus a `severity` score and a one-line human-readable rationale.

3. **`suggestReinforcement(keystone) → Reinforcement` (stretch goal)**
   Given the keystone assumption, describe what evidence or action would raise its confidence — "what to go prove first."

**Model:** latest Claude (Sonnet or Opus 4.8) via the Anthropic API, using structured output so responses are schema-validated JSON, not free text.

---

## 6. Architecture & Stack

Single **Next.js** app (one repo; API routes hold the Anthropic key and proxy all Claude calls — the key never reaches the client).

| Module | Responsibility | Depends on |
| --- | --- | --- |
| **`engine/`** | Pure TypeScript. Graph model, topological eval, support propagation, knock-out sensitivity / keystone ranking, load application, cascade rule. **No LLM, no UI.** Runs client-side. | nothing |
| **`llm/`** | Anthropic client wrappers: `extractStructure`, `generateAttacks`, `suggestReinforcement`. Schema validation + retry + fallback. | Anthropic SDK, schemas |
| **`canvas/`** | React Flow custom nodes/edges with structural styling; **adaptive layout selector** (§6.1); Dagre/ELK auto-layout; framer-motion shake / crack / collapse animations; keystone highlight. | React Flow, Dagre/ELK, framer-motion |
| **`ui/`** | Structural Integrity gauge, confidence sliders, "Apply Load" panel, attack cards, reinforcement panel. | — |
| **`store/`** | Zustand store tying graph state, LLM results, and UI together. | engine types |
| **API routes** | `/api/extract`, `/api/attacks`, `/api/reinforce` — proxy to Anthropic, hold the key. | llm/ |

Each module has one clear purpose, a small typed interface, and can be understood and tested independently. The `engine/` module in particular is deliberately isolated so it can be TDD'd with zero mocking.

### 6.1 Adaptive Cognitive Dimensionality (the interface's parametric behavior)

Keystone does not attempt a true high-dimensional interface. Instead it treats the interface itself as parametric: **as the reasoning structure grows more complex, the visual representation changes its geometry to preserve clarity** — the same way a CAD tool switches between a sketch, an assembly, and an exploded/clustered view. The "variables" are the assumptions, claims, and dependency edges already present in the DAG, so the layout can adapt purely from the graph's own complexity.

The `canvas/` module selects a layout mode from node count:

```ts
// layout selector — driven entirely by the current graph
if (nodeCount <= 8) {
  layoutMode = "simple-2d";        // small: flat, readable dependency map
} else if (nodeCount <= 25) {
  layoutMode = "layered-2-5d";     // medium: layered structural assembly
} else {
  layoutMode = "clustered-zoom";   // large: zoomable clustered decision model
}
```

- **`simple-2d` (1–8 nodes):** a flat 2D dependency map. Structure stays readable; every assumption is directly inspectable.
- **`layered-2-5d` (9–25 nodes) — the hackathon hero mode:** a layered structural view. Assumptions form the foundation, claims sit in the middle band, the thesis sits at the top (or far right). Depth is *implied* — via shadows, scaling, opacity, elevation, and the collapse/crack animations — with **no real 3D rendering required**. This is where the "wow factor" lives and it is fully feasible in the time budget.
- **`clustered-zoom` (26+ nodes):** the graph compresses into **cognitive modules** — market risk, execution risk, technical risk, competitor risk, opportunity cost. The user zooms into whichever cluster is most unstable or most load-bearing. This mode is *specified* but is a stretch target (see §11); the failure case is graceful (fall back to `layered-2-5d` with pan/zoom).

**Pitch line for this feature:** *"Keystone uses adaptive cognitive dimensionality — as assumptions accumulate, the interface shifts from a simple 2D reasoning map, to a layered structural assembly, to a clustered zoomable model. Complexity changes the geometry of the interface rather than just making the graph messier."*

Auto-layout within each mode is delegated to **Dagre** (fast, simple, good default) or **ELK** (richer layered layouts) rather than hand-placed coordinates, so any LLM-generated graph lays out cleanly without manual tuning.

---

## 7. Data Flow

1. **Extract:** user pastes a decision → `POST /api/extract` → `llm.extractStructure` → `Graph` → rendered on canvas; `engine` computes baseline integrity.
2. **Tune (parametric):** user drags a node's confidence slider → `engine` recomputes synchronously client-side → gauge and node visuals update live.
3. **Stress (FEA):** user clicks **Apply Load** → `POST /api/attacks` → `llm.generateAttacks` → severities applied → `engine` recomputes + ranks keystone → canvas animates cascade, highlights keystone, gauge craters.
4. **Reinforce (stretch):** user selects keystone → `POST /api/reinforce` → suggestion shown → raising confidence recovers integrity live.

---

## 8. The 5-Minute Demo Script

1. **(0:30)** Paste a real, plausible decision — *"We should migrate to microservices."* Structure assembles on screen. Instant "it understood my reasoning."
2. **(1:00)** Narrate the assembly: "here's everything this decision is standing on."
3. **(1:30)** Drag one confidence slider down → support re-propagates live → *"this is parametric, like a CAD sketch — change one input, the whole model re-solves."*
4. **(2:30)** Click **Apply Load.** Integrity gauge drops **90% → 34%** live. Structure buckles. One beam cracks red.
5. **(3:30)** *"That's your keystone. Everything else was quietly standing on this one unproven assumption."* Show the attack that killed it.
6. **(4:15)** *(stretch)* Reinforce it → integrity recovers → *"now you know exactly what to go validate before you commit."*

**Hero example:** *"We should migrate to microservices"* — chosen because an engineering-heavy hackathon audience has lived that exact debate and will viscerally feel the keystone crack.

---

## 9. Safety Net (the live demo must never die)

The LLM extraction call is the only fragile point. Mitigations, in order:

1. Validate every LLM response against its JSON schema.
2. On validation failure, retry once.
3. On repeated failure **or no network**, fall back to a **pre-baked example graph + cached attack set** for the rehearsed hero decision.

The team rehearses with that exact decision, so the demo runs flawlessly even offline. The fallback fixture doubles as a test fixture.

---

## 10. Testing Strategy

- **`engine/` (TDD, no mocks):** known graphs → known integrity numbers; known graphs → known keystone rankings; cascade rule → known collapse sets. This is the bulk of the automated tests and directly backs the "real solver" claim.
- **`llm/`:** smoke tests against the live API for schema conformance; the fallback fixture serves as a deterministic offline test.
- **Manual:** the demo script itself is the end-to-end acceptance test, rehearsed repeatedly before the pitch.

---

## 11. Scope & Timeline (2 days)

| When | Work |
| --- | --- |
| **Day 1 AM** | `engine/` — data model, propagation, sensitivity/keystone, cascade. TDD. |
| **Day 1 PM** | `llm.extractStructure` + schemas + API route; `canvas/` renders a graph via Dagre/ELK auto-layout in **`layered-2-5d`** mode (the hero mode). |
| **Day 2 AM** | Parametric sliders; **Apply Load** + `generateAttacks`; collapse animation; integrity gauge. |
| **Day 2 PM** | Polish, safety-net fixture, demo rehearsal. |
| **Stretch** | `suggestReinforcement` + recovery animation; `simple-2d` and `clustered-zoom` layout modes. Any of these may be cut. |

**Primary build target:** the `layered-2-5d` layout mode (§6.1) — strongest wow-to-effort ratio. `simple-2d` degrades naturally from it (fewer nodes just look flatter); `clustered-zoom` is a stretch and falls back gracefully to `layered-2-5d` with pan/zoom if unfinished.

**Explicitly out of scope (YAGNI):** user accounts, persistence/saving, multiple simultaneous decisions, collaborative editing, export, real 3D rendering (2.5D is implied via depth cues only). None serve the pitch.

---

## 12. Open Questions

- Final name (Keystone vs alternates) — cosmetic, decide before submission.
- Exact failure threshold and AND aggregation (product vs min) — tune during Day 2 for the most dramatic-yet-honest collapse.
