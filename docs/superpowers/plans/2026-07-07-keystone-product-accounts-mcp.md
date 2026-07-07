# Keystone Product — Accounts + MCP Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Supabase accounts + durable/shareable decision persistence, and connect the agents to the user's own tools via a per-user MCP Connections registry — at product quality (security, migrations, RLS, error states, privacy, cost control).

**Architecture:** `@supabase/ssr` for auth + a versioned SQL schema with RLS. The existing `library.ts` storage seam is split into local (guest) and Supabase backends behind an unchanged public surface. A `connections` table + server-only secret handling feeds Anthropic's MCP connector, threaded through the existing `src/llm/structured.ts`/agents so agents use real tools. Everything degrades gracefully to today's behavior when a key/connection is absent. Engine stays frozen.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `@supabase/supabase-js` + `@supabase/ssr`, Supabase Postgres (project `yiiuikrnuevutevujaxk`), `@anthropic-ai/sdk` 0.68.0 (MCP connector via beta messages), vitest.

## Global Constraints

- Branch `founder-b/context-ui`. Engine (`src/engine/**`) stays frozen. `library.ts` **public surface** (`saveEntry/listEntries/getEntry/deleteEntry/updateEntryVerdict/duplicateEntry`) is unchanged.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable, client-safe), `SUPABASE_SECRET_KEY` (server-only), `ANTHROPIC_API_KEY` (server-only). Already in `.env.local` (gitignored).
- **Secret safety (hard):** no `"use client"` file and nothing under `src/store/**` may import `@/lib/supabase/admin`, `@/agents/*`, `@/llm/*`, or reference `SUPABASE_SECRET_KEY` / `ANTHROPIC_API_KEY`. The browser Supabase client uses ONLY `NEXT_PUBLIC_*`. Enforced by an extended boundary test.
- **Hydration safety (T8):** no `Math.random`/`Date.now`/`new Date(` in any `"use client"` file. Timestamps come from server routes or the server-passed `startedAt`.
- Model id exactly `claude-opus-4-8`. Every LLM/agent/MCP path: validate → retry once → fixture/honest-error fallback → never throw a 500.
- Migrations live in `supabase/migrations/*.sql`, applied by the user via the Supabase SQL editor or `supabase db push`. Code must run in **guest mode** before any migration is applied.
- Model number formatting / ledger UI tokens (`src/ui/theme.css`, `src/ui/primitives.tsx`) are the design system — reuse them; no new visual language.

---

## File Structure (created / modified)

**New — Supabase core (server/secret files are NEVER client-imported):**
```
src/lib/supabase/client.ts        # browser client (NEXT_PUBLIC_* only)
src/lib/supabase/server.ts        # server client (cookies via next/headers)
src/lib/supabase/admin.ts         # service client (SUPABASE_SECRET_KEY) — server-only
src/lib/supabase/types.ts         # DB row types (DecisionRow, ConnectionRow, RunRow, ConnectionPublic)
middleware.ts                     # session refresh (root)
supabase/migrations/0001_init.sql # schema + RLS + profile trigger + connections public view
supabase/README.md                # how to apply migrations + enable GitHub OAuth
```
**New — persistence seam + API:**
```
src/lib/library/index.ts          # SAME public surface; resolves backend by auth state
src/lib/library/local.ts          # today's localStorage impl (moved verbatim)
src/lib/library/remote.ts         # Supabase-backed impl (calls /api/decisions)
src/lib/library/types.ts          # LibraryEntry etc (moved from library.ts)
src/app/api/decisions/route.ts            # GET list, POST create
src/app/api/decisions/[id]/route.ts       # GET/PATCH/DELETE one
src/app/d/[id]/page.tsx           # public read-only share view
```
**New — auth UI:**
```
src/app/login/page.tsx            # email magic-link + GitHub button
src/app/auth/callback/route.ts    # OAuth/code exchange → redirect
src/app/account/page.tsx          # profile, export, delete
src/ui/AccountMenu.tsx            # top-bar avatar/email + sign out
src/lib/useSession.ts             # client hook: current user (browser client)
```
**New — connections + MCP:**
```
src/app/api/connections/route.ts        # GET list (public view), POST create
src/app/api/connections/[id]/route.ts   # PATCH/DELETE
src/app/api/connections/[id]/test/route.ts  # test a connection (list its MCP tools)
src/ui/ConnectionsPanel.tsx             # list/add/test/revoke UI
src/lib/mcp/connector.ts                # ConnectionRow[] → Anthropic mcp_servers defs (server)
src/lib/mcp/kinds.ts                    # preset kinds (github/linear/notion/jira/calendar/custom)
src/agents/runs.ts                      # rate/cost guard + runs logging (server)
```
**Modified:**
```
src/lib/library.ts                # becomes a thin re-export of src/lib/library/index.ts (surface unchanged)
src/llm/structured.ts             # optional mcpServers param on structuredCall
src/agents/technical.ts,business.ts,temporal.ts  # accept + use mcpServers; deeper prompts
src/app/api/gather/route.ts       # load authed user's connections → pass mcpServers; log run
src/store/boundary.test.ts        # extend: forbid admin/secret/agents/llm in client
src/app/KeystoneApp.tsx           # mount AccountMenu; wire library resolver (surface unchanged)
package.json                      # + @supabase/supabase-js, @supabase/ssr
```

---

## PHASE P1 — Supabase foundation

### Task 1: Install deps + browser/server/admin clients

**Files:** Create `src/lib/supabase/{client,server,admin,types}.ts`; Modify `package.json`; Test `src/lib/supabase/clients.test.ts`.

**Interfaces — Produces:**
- `createBrowserSupabase(): SupabaseClient` (client.ts, `"use client"`-safe, NEXT_PUBLIC only)
- `createServerSupabase(): Promise<SupabaseClient>` (server.ts, cookies-bound)
- `createAdminSupabase(): SupabaseClient` (admin.ts, secret key, server-only)
- types: `DecisionRow`, `ConnectionRow`, `ConnectionPublic` (no `secret`), `RunRow`

- [ ] **Step 1: Install**

Run: `npm install @supabase/supabase-js @supabase/ssr`
Expected: added to dependencies.

- [ ] **Step 2: `src/lib/supabase/client.ts`**

```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser client — publishable key only. Safe to bundle. Never reads a secret.
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: `src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client bound to the request cookies (App Router). Uses the publishable key +
// the user's session cookie, so RLS applies as that user.
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — safe to ignore; middleware refreshes.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: `src/lib/supabase/admin.ts`** (server-only; the boundary test forbids client import)

```ts
import { createClient } from "@supabase/supabase-js";

// Service client — SECRET key, bypasses RLS. NEVER import from a "use client" file.
// Use only in API routes for privileged reads (e.g. connection secrets, profile trigger backfill).
export function createAdminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 5: `src/lib/supabase/types.ts`**

```ts
import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import type { Graph } from "@/engine";

export interface DecisionRow {
  id: string; user_id: string; title: string; mode: string;
  input: ContextInput; company_context: CompanyContext | null;
  pack: DecisionContextPack | null; graph: Graph;
  verdict: { integrity: number; keystoneId: string | null; failedIds: string[]; loadApplied: boolean };
  seq: number; is_public: boolean; created_at: string; updated_at: string;
}
export type ConnectionKind = "github" | "linear" | "notion" | "jira" | "calendar" | "custom";
export interface ConnectionRow {           // server-side shape (includes secret)
  id: string; user_id: string; kind: ConnectionKind; name: string;
  url: string; secret: string | null; status: "untested" | "ok" | "error";
  last_used_at: string | null; created_at: string;
}
export type ConnectionPublic = Omit<ConnectionRow, "secret">;   // what the client ever sees
export interface RunRow { id: string; user_id: string; kind: string; source: "live" | "fixture"; tokens_in: number; tokens_out: number; created_at: string; }
```

- [ ] **Step 6: Write test `src/lib/supabase/clients.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createAdminSupabase } from "./admin";

describe("supabase clients", () => {
  it("admin client constructs from env without throwing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://x.supabase.co";
    process.env.SUPABASE_SECRET_KEY ||= "sb_secret_test";
    expect(() => createAdminSupabase()).not.toThrow();
  });
});
```

- [ ] **Step 7: Run + commit**

Run: `npx vitest run src/lib/supabase && npx tsc --noEmit`
Expected: PASS, clean.
```bash
git add -A && git commit -m "feat(supabase): browser/server/admin clients + row types"
```

### Task 2: Session-refresh middleware

**Files:** Create `middleware.ts`. Test: manual (middleware needs a live request).

**Interfaces — Produces:** root middleware that refreshes the Supabase session cookie on every request and never blocks guests.

- [ ] **Step 1: `middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // Touch the user to trigger refresh; never throw for guests.
  await supabase.auth.getUser().catch(() => {});
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/gather).*)"],
};
```
> Note: `/api/gather` is excluded so the SSE stream isn't wrapped. Other API routes create their own server client per request.

- [ ] **Step 2: Verify build + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds (middleware compiles).
```bash
git add middleware.ts && git commit -m "feat(auth): session-refresh middleware (guest-safe)"
```

### Task 3: Schema migration (tables + RLS + trigger + public view)

**Files:** Create `supabase/migrations/0001_init.sql`, `supabase/README.md`. Test: SQL is applied by the user; add a shape test in a later task against the types.

- [ ] **Step 1: `supabase/migrations/0001_init.sql`**

```sql
-- profiles: 1:1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- auto-create a profile row on signup
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- decisions
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  mode text not null,
  input jsonb not null,
  company_context jsonb,
  pack jsonb,
  graph jsonb not null,
  verdict jsonb not null,
  seq bigint not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decisions_user_seq on public.decisions (user_id, seq desc);
alter table public.decisions enable row level security;
create policy "own decisions" on public.decisions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "public read shared" on public.decisions for select using (is_public);

-- connections (secret is NEVER exposed to the client role; see the view below)
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('github','linear','notion','jira','calendar','custom')),
  name text not null,
  url text not null,
  secret text,
  status text not null default 'untested' check (status in ('untested','ok','error')),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.connections enable row level security;
create policy "own connections" on public.connections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Revoke direct column access to `secret` from the API (publishable) roles: they must use the view.
revoke select on public.connections from anon, authenticated;
grant select (id, user_id, kind, name, url, status, last_used_at, created_at) on public.connections to authenticated;
grant insert, update, delete on public.connections to authenticated;

-- secret-omitting view the client lists from
create or replace view public.connections_public as
  select id, user_id, kind, name, url, status, last_used_at, created_at from public.connections;
grant select on public.connections_public to authenticated;

-- runs (usage / rate limiting)
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  source text not null check (source in ('live','fixture')),
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists runs_user_time on public.runs (user_id, created_at desc);
alter table public.runs enable row level security;
create policy "own runs" on public.runs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: `supabase/README.md`** — document applying it:

```md
# Supabase setup
1. Apply the schema: paste `migrations/0001_init.sql` into the Supabase SQL editor and run it
   (or `supabase db push` with the CLI linked to project yiiuikrnuevutevujaxk).
2. Enable GitHub OAuth: Auth → Providers → GitHub. Create a GitHub OAuth app, paste client id/secret.
   Add redirect URLs: http://localhost:3000/auth/callback and your prod URL.
3. Email magic-link works out of the box.
The app runs in guest mode (localStorage) until the schema is applied and a user signs in.
```

- [ ] **Step 3: Commit**
```bash
git add supabase/ && git commit -m "feat(db): initial schema + RLS + connections public view"
```

---

## PHASE P2 — Auth UI + persistence seam

### Task 4: Split `library.ts` into local + remote backends behind the same surface

**Files:** Create `src/lib/library/{index,local,remote,types}.ts`; Modify `src/lib/library.ts` → thin re-export; Test `src/lib/library/resolve.test.ts`.

**Interfaces — Produces:** unchanged surface `saveEntry/listEntries/getEntry/deleteEntry/updateEntryVerdict/duplicateEntry` from `@/lib/library`, now async-capable via a resolver. `LibraryEntry`, `NewLibraryEntry`, `LibraryVerdict`, `LibraryMode` re-exported.

- [ ] **Step 1:** Move the current `src/lib/library.ts` body verbatim into `src/lib/library/local.ts` (rename exports to `local*`: `localSave`, `localList`, `localGet`, `localDelete`, `localUpdateVerdict`, `localDuplicate`). Move the interfaces into `src/lib/library/types.ts`.

- [ ] **Step 2: `src/lib/library/remote.ts`** — same surface, backed by `/api/decisions` (fetch). Signatures return Promises. (Full CRUD via fetch; on any network error, return `[]`/`null` and let the caller stay usable.)

- [ ] **Step 3: `src/lib/library/index.ts`** — resolver: expose the SAME names; each checks a module-level `mode: "guest" | "user"` set by `setLibraryBackend(mode)` (called by the session hook on auth change). Guest → local (sync, wrapped in `Promise.resolve`); user → remote. Re-export types.

- [ ] **Step 4: `src/lib/library.ts`** → `export * from "./library/index";` (surface preserved; existing imports unaffected).

- [ ] **Step 5: Test `src/lib/library/resolve.test.ts`** — guest mode round-trips through local (save→list→get→delete); switching to user mode routes to remote (mock `fetch`).

- [ ] **Step 6:** Run `npx vitest run src/lib/library && npx tsc --noEmit`; commit.

> **Caller impact:** `KeystoneApp` currently calls these synchronously. Where a call now returns a Promise, `await` it (small edits, same names). List those edits in the task; keep them minimal.

### Task 5: `/api/decisions` routes

**Files:** Create `src/app/api/decisions/route.ts`, `src/app/api/decisions/[id]/route.ts`; Test `src/app/api/decisions/route.test.ts`.

- Uses `createServerSupabase()`; all queries run as the authed user (RLS enforces ownership). `GET /` → list (seq desc); `POST /` → insert (compute next seq server-side); `[id]` → `GET`/`PATCH` (verdict/is_public)/`DELETE`. Unauthed → 401. Test the handlers directly with a mocked server client returning fixture rows; assert shape + 401 path.
- Commit.

### Task 6: Auth pages + callback + account menu + session hook

**Files:** Create `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/account/page.tsx`, `src/ui/AccountMenu.tsx`, `src/lib/useSession.ts`; Modify `src/app/KeystoneApp.tsx` (mount `AccountMenu` in the TopBar; call `setLibraryBackend` on session change).

- `useSession.ts` (`"use client"`): subscribes to `createBrowserSupabase().auth.onAuthStateChange`, returns `{ user, loading }`, and calls `setLibraryBackend(user ? "user" : "guest")`.
- `login/page.tsx`: email magic-link (`signInWithOtp`) + "Continue with GitHub" (`signInWithOAuth({ provider:"github", options:{ redirectTo: location.origin + "/auth/callback" }})`). Ledger styling.
- `auth/callback/route.ts`: `exchangeCodeForSession(code)` then redirect to `/`.
- `AccountMenu.tsx`: avatar/email, Account, Connections, Sign out (`signOut()`); guest → "Sign in to save".
- `account/page.tsx`: shows email; **Export** (download all decisions JSON via `/api/decisions`); **Delete account** (calls `/api/account/delete` — a route using the admin client to delete the user + cascade). Ledger styling; three states.
- Tests: `useSession` backend-switch (mock auth), AccountMenu render (jsdom). Commit.

### Task 7: Share link `/d/[id]`

**Files:** Create `src/app/d/[id]/page.tsx`; add a "Share" toggle to the saved-decision UI (flip `is_public`, copy `/d/<id>`).
- Server component: `createServerSupabase().from("decisions").select().eq("id", id).eq("is_public", true).single()`; render read-only graph + verdict + context-used (reuse existing read-only components). Not found / not public → a clean 404 state. Commit.

---

## PHASE P3 — Connections

### Task 8: `/api/connections` CRUD + test route + kinds presets

**Files:** Create `src/app/api/connections/route.ts`, `[id]/route.ts`, `[id]/test/route.ts`, `src/lib/mcp/kinds.ts`; Test `src/app/api/connections/route.test.ts`.

- `kinds.ts`: preset map — `{ github: { url:"https://api.githubcopilot.com/mcp/", secretLabel:"GitHub token (PAT)" }, linear:{url:"https://mcp.linear.app/mcp",...}, notion:{...}, jira:{...}, calendar:{...}, custom:{ url:"", secretLabel:"Bearer token (optional)" } }`.
- List route reads `connections_public` (no secret). Create/patch/delete use the authed server client; **secret is write-only** (accepted on POST/PATCH, never returned). `[id]/test`: server loads the row's secret via the **admin** client, builds one MCP-connector def, makes a minimal Anthropic beta call listing the server's tools, updates `status` ok/error + a short message. Unauthed → 401.
- Tests: shape of list (no `secret` field), 401 path, test-route offline behavior (no key → `status:"untested"` honest result, no throw). Commit.

### Task 9: Connections UI

**Files:** Create `src/ui/ConnectionsPanel.tsx`; mount at `/account/connections` and an in-studio drawer.
- List connections (health chip ok/error/untested, last used), **Add** (pick kind → prefilled url + token field), **Test**, **Revoke**. Ledger styling; loading/empty/error states. Reads via `/api/connections` (public view); writes via the same. Never handles the secret after submit. Commit.

---

## PHASE P4 — MCP connector wiring + agent depth + guardrails

### Task 10: Connector builder + runs guard

**Files:** Create `src/lib/mcp/connector.ts`, `src/agents/runs.ts`; Test `src/lib/mcp/connector.test.ts`, `src/agents/runs.test.ts`.

**Interfaces — Produces:**
- `buildMcpServers(rows: ConnectionRow[]): McpServerDef[]` where `McpServerDef = { type:"url"; name:string; url:string; authorization_token?:string }` (only enabled, non-empty-url rows; name is a slug of `name`).
- `toolsetFor(defs): { type:"mcp_toolset"; mcp_server_name:string }[]`.
- `checkRunAllowed(userId): Promise<{ allowed:boolean; reason?:string }>` (counts `runs` in the last hour/month; caps: 30/hr, 500/mo) and `logRun(userId, kind, source, tokensIn, tokensOut)`.

- [ ] TDD `buildMcpServers`: given rows (one github with secret, one custom no secret, one empty-url) → correct defs (empty-url dropped; token mapped to `authorization_token`; missing secret omits the field). `toolsetFor` mirrors names.
- [ ] TDD `checkRunAllowed`: mock admin client counts → allowed under cap, blocked over cap with reason.
- [ ] Commit.

### Task 11: Thread `mcpServers` through structured + agents

**Files:** Modify `src/llm/structured.ts` (add optional `mcpServers?: McpServerDef[]` to `structuredCall`; when present, call `client.beta.messages` with `mcp_servers` + `mcp_toolset` tools + beta `mcp-client-2025-11-20`, using a single localized cast if the 0.68.0 types lack the fields; validate the claude-api reference shape); Modify `src/agents/{technical,business,temporal}.ts` (accept `mcpServers` and pass through; when GitHub tools are available, the technical agent prefers reading real files/issues/PRs over the shallow clone); Modify `src/app/api/gather/route.ts` (get the authed user via `createServerSupabase`; if present, load their `connections` via admin, `buildMcpServers`, `checkRunAllowed` before any paid call, pass `mcpServers` down, `logRun` after).

- [ ] Extend `src/agents/gather.test.ts`: with no key AND no connections, behavior is unchanged (fixture path, never throws). With a stub `mcpServers`, the call path selects the MCP branch (mock `structuredCall`), and `logRun` is invoked.
- [ ] `tsc` + vitest + build; commit.

### Task 12: Deeper agent prompts (source-cited findings)

**Files:** Modify `src/agents/{technical,business,temporal}.ts` prompts/tool-budgets so findings are detailed and each carries a real `source` (file path / URL / ticket id / event). No new files. Keep offline fixtures intact.
- [ ] Extend fixtures/tests so each kind's fixture still validates and findings have non-empty `source`. Commit.

---

## PHASE P5 — Security, privacy, states, verification

### Task 13: Extend boundary + add RLS test

**Files:** Modify `src/store/boundary.test.ts` (forbid `@/lib/supabase/admin`, `SUPABASE_SECRET_KEY`, `@/agents/*`, `@/llm/*` in any `"use client"`/`src/store/**` file); Create `src/app/api/decisions/rls.test.ts` (integration: with two mocked user contexts, user B cannot read user A's rows — assert the query filters by `auth.uid()`; if a live DB is available via env, run a real cross-user check, else assert the route always scopes by the session user).
- [ ] Run the full suite; commit.

### Task 14: Privacy (export + delete) + honest states pass

**Files:** Create `src/app/api/account/delete/route.ts` (admin client: delete `auth.users` row → cascades); ensure `account/page.tsx` Export downloads JSON; sweep every new surface for loading/empty/error states.
- [ ] Manual + component tests where feasible; commit.

### Task 15: Full product gate

- [ ] `npx tsc --noEmit` clean · `npx vitest run` all green · `npm run build` exit 0.
- [ ] Boundary + RLS tests green; no client `Date`/`random`.
- [ ] **Guest smoke (offline):** app loads, analyse→graph→stress works, decisions save to localStorage, no console errors.
- [ ] **Auth smoke (keys + migration applied):** sign in with email link; save a decision; reload → persists; toggle share → `/d/<id>` opens read-only; add a GitHub connection → Test returns tool list; run technical agent → ≥5 source-cited findings with real paths.
- [ ] Commit / tag.

---

## Self-review

**Spec coverage:** §3 auth/persistence → Tasks 1–7; §4 MCP/connections → Tasks 8–12; §5 security → Tasks 1,3,8,10,13; §6 states → Tasks 6,9,14; §7 testing → each task + Task 15; §8 non-goals respected (token-paste presets, no pgsodium, no OAuth-for-PM-tools, existing scaffolding untouched). No gaps.

**Placeholders:** none — code shown for the load-bearing seams (clients, middleware, SQL, connector); UI tasks specify exact files, states, and data sources. UI-heavy tasks (6,7,9) are spec'd rather than line-coded because they reuse the existing ledger primitives; implementers follow `src/ui/primitives.tsx`.

**Type consistency:** `ConnectionRow`/`ConnectionPublic`/`DecisionRow`/`RunRow` (Task 1) are used consistently in Tasks 5,8,10,11; `McpServerDef` defined in Task 10 and consumed in Task 11; `library` surface names unchanged across Tasks 4–7.

**Known risk (flagged in-task):** `@anthropic-ai/sdk` 0.68.0 may not type `mcp_servers`/`mcp_toolset` — Task 11 uses a single localized cast at that boundary and validates against the claude-api reference; do not upgrade the SDK (it would disturb the existing `toolRunner` path the app depends on).
