# Keystone — Product Design: Accounts + MCP-Connected Agents

**Date:** 2026-07-07 · Branch: `founder-b/context-ui` · **Mode: product** (not hackathon demo).
Supersedes the demo framing: fixtures/scenarios become *graceful degradation*, not the centerpiece. The happy path is the real thing working — real auth, real persistence, real MCP-backed agents — built to product quality (security, migrations, error states, privacy, cost control).

---

## 1. Goal

Turn Keystone from a single-session demo into a real product a user signs into, connects their own tools to, and keeps a durable, shareable library of stress-tested decisions in.

Two subsystems, joined by one idea:

- **Accounts & persistence** (Supabase): sign in, save decisions durably, share them.
- **MCP-connected agents**: the agents pull *real* data from the user's own tools (GitHub, web, PM tools, calendar, or any MCP server) instead of a shallow clone.

**The linchpin:** a per-user **Connections registry** — every MCP source is one row `{ kind, name, url, secret }`. Accounts own connections; agents consume them. Build one mechanism, not five integrations.

---

## 2. Non-negotiable product qualities

1. **Security first.** MCP tokens + the Supabase secret key live **server-side only**; never in a client bundle or a client-readable table column. RLS on every user table. The existing client/key-safety boundary test is extended to cover Supabase-secret + connection-secret leakage.
2. **Graceful degradation, not fake demos.** No key / no connection / provider down → a clear, honest state (or the deterministic fixture in dev), never a silent lie. Errors surface; they don't crash.
3. **Privacy.** A user can export and permanently delete their account + all data.
4. **Cost & abuse control.** Per-user rate limits on agent/LLM runs; a hard monthly run cap; every run logged.
5. **Reproducible infra.** DB schema lives in versioned SQL migrations under `supabase/migrations/`, applied via the Supabase CLI — not hand-clicked.

---

## 3. Track 1 — Accounts & persistence (Supabase)

### 3.1 Auth
- **`@supabase/ssr`** (the App-Router pattern): a browser client, a server client, and **Next middleware** that refreshes the session cookie on every request.
- **Methods:** GitHub OAuth (primary — the same identity seeds a GitHub MCP connection later) + email magic-link. No passwords.
- **Guest mode stays:** unauthenticated users still get the current localStorage library, so someone can try Keystone before signing up. A persistent "Sign in to save across devices" affordance.
- **UI:** a top-bar account menu (avatar / email, Sign out, Account, Connections); a `/login` page; an `/account` page (profile, export, delete).

### 3.2 Data model (migrations, RLS)
`supabase/migrations/0001_init.sql`:

- **`profiles`** — `id uuid pk references auth.users`, `email`, `created_at`. Row created by a trigger on `auth.users` insert.
- **`decisions`** — mirrors `LibraryEntry`: `id uuid pk`, `user_id uuid references auth.users`, `title text`, `mode text`, `input jsonb`, `company_context jsonb`, `pack jsonb`, `graph jsonb`, `verdict jsonb`, `seq bigint`, `is_public boolean default false`, `created_at`, `updated_at`. Index `(user_id, seq desc)`.
- **`connections`** — `id uuid pk`, `user_id`, `kind text` (`github|linear|notion|jira|calendar|custom`), `name text`, `url text`, `secret text` (**server-only**, see §5), `status text` (`untested|ok|error`), `last_used_at`, `created_at`.
- **`runs`** — usage/audit + rate limiting: `id`, `user_id`, `kind` (`gather|extract|attacks|tunnel`), `source` (`live|fixture`), `tokens_in`, `tokens_out`, `created_at`.

**RLS:** every table `enable row level security`; policies = `user_id = auth.uid()` for select/insert/update/delete. `decisions` adds a public-read policy `using (is_public)` for share links. `connections.secret` is **never** selectable by the anon/publishable role (see §5).

### 3.3 Persistence seam (zero rewrite above it)
`library.ts` already declares its storage as a swappable seam. Introduce `src/lib/library/` with two backends behind the **same public surface** (`saveEntry/listEntries/getEntry/deleteEntry/updateEntryVerdict/duplicateEntry`):
- `localBackend` — the current localStorage impl (guest).
- `supabaseBackend` — calls `/api/decisions` routes (server) which use the authed user client.
- A tiny resolver picks the backend from auth state. **`KeystoneApp` and every caller stay unchanged.**
- **First-login migration:** on first sign-in, offer to import the guest localStorage library into the account (one-time, idempotent by content hash).

### 3.4 Share links
`/d/[id]` — server component reads a `decisions` row **only if `is_public`**; renders a read-only collapsed decision (graph + verdict + context used). A "Share" toggle on a saved decision flips `is_public` and copies the link.

---

## 4. Track 2 — MCP-connected, detailed agents

### 4.1 Connections registry + UI
- **Connections panel** (`/account/connections` and an in-studio drawer): list the user's connections with health (`ok/error/untested`, last used); **Add** (pick a kind → fill name + URL + token, or GitHub OAuth); **Test** (a server round-trip that lists the MCP server's tools); **Revoke/Delete**.
- **First-class kinds:** **GitHub** (PAT now; OAuth token from GitHub login later) and **Custom** (any MCP URL + optional bearer). Linear/Notion/Jira/Calendar are presets that prefill the URL and ask for a token — same row shape, so they "just work" if the user has a token; full OAuth for those is a later iteration, explicitly out of scope now (§8).

### 4.2 Connector wiring (the real MCP)
- All Claude calls already funnel through `src/llm/structured.ts` (`structuredCall`, `hasApiKey`) and the agents. Add an **optional `mcpServers` param** threaded from the route → agent → `structuredCall`.
- The route (`/api/gather`, `/api/tunnel`, extract/attacks) loads the **authed user's connections** (server, secret key), maps them to Anthropic MCP-connector definitions, and passes them down.
- Claude call uses `client.beta.messages` with `mcp_servers: [{ type:"url", name, url, authorization_token }]` + `tools:[{ type:"mcp_toolset", mcp_server_name:name }]` and beta `mcp-client-2025-11-20`. (SDK 0.68.0: if these fields aren't typed, pass via a single localized cast at that boundary; verified against the claude-api reference. Do **not** upgrade the SDK mid-track — it would disturb the existing `toolRunner`/`betaZodTool` path.)
- **Degradation:** no connections → the agent runs exactly as today (shallow clone / web tools / fixtures). MCP is additive.

### 4.3 Agent depth
- **Technical** — with a GitHub connection, read real files, `README`, dependency manifests, open issues, recent PRs, CI config, commit velocity → detailed, **source-cited** technical context (each finding carries a real path/URL). Falls back to the shallow clone, then fixtures.
- **Business** — deepen existing web search/fetch (site, competitors, funding/news) + Notion if connected → cited business findings.
- **Temporal** — calendar connection (or pasted agenda) → real upcoming meetings/deadlines with dates.
- Findings feed the existing compile→extract pipeline unchanged; the win is *evidence quality*.

---

## 5. Security & secret handling

- **Supabase secret key** (`SUPABASE_SECRET_KEY`) — server routes only. A `src/lib/supabase/admin.ts` (service client) is imported **only** by `src/app/api/**`; the client/boundary test forbids it in any `"use client"` file.
- **Connection secrets** — stored in `connections.secret`. Baseline: RLS + a Postgres **column privilege** so the `anon`/publishable role cannot `select` `secret` (only the service role can); the client reads connections through a **view** that omits `secret`. Stretch: encrypt at rest with `pgsodium`/Vault. Secrets are passed to Claude's MCP connector **only** inside the server route.
- **Boundary tests extended:** no `"use client"` / `src/store/**` file imports `@/lib/supabase/admin`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `@/agents/*`, `@/llm/*`. The browser Supabase client uses only `NEXT_PUBLIC_*`.
- **Rate/cost:** a server guard checks `runs` count per user per window before any paid call; over cap → a clear "run limit reached" state, no call.

---

## 6. Error, loading, empty states (product polish)
Every new surface has three states: **loading** (skeleton/spinner in the ledger style), **empty** ("No decisions yet — analyse one"), **error** (honest message + retry). Auth errors route to `/login`. A failed MCP test shows the provider's error, not a fixture.

---

## 7. Testing metrics (product gates)

- **Unit:** persistence backends (local + supabase adapter contract), connection mapping → MCP-connector defs, rate-limit guard, RLS-omitting view shape.
- **Integration (offline, no key):** `/api/decisions` CRUD against a mocked/authed client; `/api/gather` with a connection present still returns valid findings (fixture path); connector-def builder produces correct `mcp_servers` shape from a `connections` row.
- **Security:** boundary guard green (no secret/admin import client-side); an RLS test (a second user cannot read another's `decisions`/`connections`); the `connections` client view never exposes `secret`.
- **Auth flow:** sign-in redirect + session middleware refresh (component/integration).
- **Migrations:** `supabase db reset` applies cleanly; a seed script inserts a demo user + decision.
- **Existing suite stays green**; `tsc` clean; `npm run build` exit 0; no client `Math.random`/`Date.now`/`new Date`.
- **Live smoke (with keys):** real GitHub connection → technical agent returns ≥5 source-cited findings with real file paths; sign in with GitHub → save a decision → reload → it persists; share link opens read-only.

---

## 8. Explicit non-goals (this iteration)
- Full OAuth flows for Linear/Notion/Jira/Google Calendar (token-paste only for now).
- Team/multi-user workspaces, roles, billing.
- Encrypting connection secrets with pgsodium/Vault (baseline column-privilege isolation now; encryption is a fast-follow).
- Ripping out the existing scenario/scripted-duel/landing scaffolding — kept as dev fallbacks; trim later.
- Realtime/collaboration.

---

## 9. Build tracks (parallelizable, as before)
- **P1 — Supabase foundation:** deps (`@supabase/supabase-js`, `@supabase/ssr`), env wiring, `src/lib/supabase/{client,server,admin}.ts`, middleware, migrations (`0001_init.sql` schema+RLS+profile trigger), `supabase db reset` green.
- **P2 — Auth UI + persistence seam:** login/account pages, account menu, `library/` backend split + resolver + first-login import, `/api/decisions` routes, share link `/d/[id]`.
- **P3 — Connections:** `connections` table already in P1; `/api/connections` CRUD + **Test**; connections UI (panel + presets); secret-omitting view.
- **P4 — MCP connector wiring + agent depth:** thread `mcpServers` through `structured`/agents/routes; connector-def builder; deepen technical/business/temporal prompts + tool budgets; runs logging + rate guard.
- **P5 — Product polish + verify:** loading/empty/error states, privacy (export/delete), boundary + RLS tests, live smoke, full gate.

Each track: TDD the logic seams, extend boundary/RLS guards, `tsc`+build+vitest, small commits. Engine stays frozen; `library.ts` public surface unchanged.
