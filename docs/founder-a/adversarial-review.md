# Founder A — Adversarial Review

Method: 3 independent reviewers (engine-purity, key-safety, fixtures/contracts) tried to break the
implementation against its hard constraints, followed by an Opus consolidation/verification pass that
re-read the cited files to reject false positives. Raw findings: **3**. Verified defects: **0**.

## Findings & dispositions

| # | Reviewer | Severity (raw) | Claim | Verdict | Action |
|---|---|---|---|---|---|
| 1 | engine-purity | critical | "Unknown/ghost `childIds` are treated as 0 support, so the LLM can inject a bad id to tank integrity — violates 'LLM proposes, code decides'." | **Rejected as a violation** by consolidation: the engine computes deterministically from whatever structure it is given; the LLM *proposing structure* is its defined role, and unknown children are already handled safely (no crash, deterministic 0). Not an engine-purity or determinism defect. | Nonetheless **hardened proactively** — see below. |
| 2 | key-safety | — | (no findings) | Clean: SDK + `ANTHROPIC_API_KEY` confined to `structured.ts`; client-safe modules verified free of both; barrel does not re-export `compile.ts`; wrappers never throw. | none |
| 3 | fixtures-contracts | — | (no findings) | Clean: hero-graph math re-derived (baseline ≈61.97, `k_credible` strictly dominant, post-load <10, `c_roi` holds) and confirmed pinned; base `a_arch` fixture untouched; zod↔TS mirror; no `any`; no mutation in pure fns. | none |

## Proactive hardening (beyond the verified set)

Although finding #1 was correctly rejected as *not a violation*, its underlying point — that a live LLM
could emit a graph with **dangling `childIds` or a missing thesis** that still passes shape validation —
is a real robustness gap for the "demo must not fail" guarantee. Added a pure referential validator and
wired it into the LLM boundary:

- `src/engine/validate.ts` — `graphReferenceIssues(graph)` / `isGraphWellFormed(graph)` (pure; flags
  dangling childIds, missing/duplicate ids, missing thesis, empty graph). Unit-tested in `validate.test.ts`.
- `src/llm/client.ts::extractStructure` now rejects a referentially-broken model graph → `withRetryFallback`
  retries once, then falls back to a fixture. The engine therefore never computes on a malformed graph.

This strengthens robustness without touching engine purity (the validator is pure and imports only
`./types`; the engine still degrades unknown children safely as defense in depth).

## Unresolved risks
- The **live** Claude path is not integration-tested (no key in CI); correctness rests on design +
  typecheck + the offline fallback. Acceptable for the hackathon (offline demo is the rehearsed path).
