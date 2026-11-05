-- BU Job Lab · Supabase schema
-- Run once in Supabase → SQL Editor. Then enable: Auth → Providers → GitHub, and Auth → Anonymous sign-ins.

create extension if not exists pgcrypto;

-- Who may run the game (GitHub usernames). Edit if you add facilitators.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(lower(auth.jwt() -> 'user_metadata' ->> 'user_name') in ('thisisaviram'), false)
$$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null default 'ציד משרות',
  status text not null default 'draft' check (status in ('draft','lobby','live','closed')),
  duration_min int not null default 12,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  owner uuid default auth.uid()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  full_name text not null check (char_length(full_name) between 2 and 60),
  nickname text not null check (char_length(nickname) between 2 and 24),
  score int not null default 0 check (score between 0 and 100),
  missions jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.events enable row level security;
alter table public.players enable row level security;

-- Admin: full access
drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists players_admin on public.players;
create policy players_admin on public.players for all using (public.is_admin()) with check (public.is_admin());

-- Player: read and update only their own row (joining goes through join_event)
drop policy if exists players_self_select on public.players;
create policy players_self_select on public.players for select using (user_id = auth.uid());
drop policy if exists players_self_update on public.players;
create policy players_self_update on public.players for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Event info by code (no listing of events for non-admins)
create or replace function public.event_by_code(p_code text)
returns table (id uuid, code text, title text, status text, duration_min int, started_at timestamptz, server_now timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.code, e.title, e.status, e.duration_min, e.started_at, now()
  from events e where e.code = upper(trim(p_code)) and e.status <> 'draft'
$$;

-- Join an open event (lobby or live)
create or replace function public.join_event(p_code text, p_full_name text, p_nickname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev events; pid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into ev from events where code = upper(trim(p_code)) and status in ('lobby','live');
  if not found then raise exception 'event not open'; end if;
  insert into players (event_id, user_id, full_name, nickname)
  values (ev.id, auth.uid(), trim(p_full_name), trim(p_nickname))
  on conflict (event_id, user_id) do update set full_name = excluded.full_name, nickname = excluded.nickname, updated_at = now()
  returning id into pid;
  return pid;
end $$;

-- Report progress (only for your own row, only while the event is live)
create or replace function public.report_progress(p_code text, p_score int, p_missions jsonb, p_stats jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ev events;
begin
  select * into ev from events where code = upper(trim(p_code)) and status = 'live';
  if not found then return; end if;
  update players set score = greatest(0, least(100, p_score)), missions = p_missions, stats = p_stats, updated_at = now()
  where event_id = ev.id and user_id = auth.uid();
end $$;

-- Public leaderboard (nicknames only)
create or replace function public.leaderboard(p_code text)
returns table (nickname text, score int, missions jsonb, stats jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.nickname, p.score, p.missions, p.stats, p.updated_at
  from players p join events e on e.id = p.event_id
  where e.code = upper(trim(p_code)) and e.status <> 'draft'
  order by p.score desc, p.updated_at asc
$$;

grant execute on function public.event_by_code(text), public.join_event(text,text,text),
  public.report_progress(text,int,jsonb,jsonb), public.leaderboard(text) to anon, authenticated;
