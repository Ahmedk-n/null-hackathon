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
