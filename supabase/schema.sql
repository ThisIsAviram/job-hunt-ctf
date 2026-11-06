-- BU Job Lab · Supabase schema
-- Run once in Supabase → SQL Editor. Then enable: Auth → Providers → GitHub, and Auth → Anonymous sign-ins.


-- Who may run the game (GitHub usernames). Edit if you add facilitators.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  -- identity_data comes from GitHub and cannot be edited by the user (user_metadata can).
  select exists (
    select 1 from auth.identities i
    where i.user_id = auth.uid() and i.provider = 'github'
      and lower(i.identity_data ->> 'user_name') in ('thisisaviram')
  )
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

-- ───────── Host key: run the game from the presentation without a GitHub login ─────────
-- The admin sets a long random key once (admin.html → "מפתח מצגת"). The deck keeps it locally
-- and uses it to open an event, START and close. Only its SHA-256 hash is stored.
create table if not exists public.host_secret (
  id int primary key default 1 check (id = 1),
  hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.host_secret enable row level security;  -- no policies: reachable only via the functions below

create or replace function public.set_host_secret(p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if char_length(coalesce(p_secret, '')) < 16 then raise exception 'host key too short'; end if;
  insert into host_secret (id, hash) values (1, encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
  on conflict (id) do update set hash = excluded.hash, updated_at = now();
end $$;

create or replace function public.host_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public as $$
  select char_length(coalesce(p_secret, '')) >= 16
     and exists (select 1 from host_secret where hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
$$;

-- Open (or reuse) today's event in lobby
create or replace function public.host_open_event(p_secret text, p_code text, p_title text, p_duration int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(p_code)); ev events;
begin
  if not public.host_ok(p_secret) then raise exception 'bad host key'; end if;
  if c !~ '^[0-9]{6}[A-Z]{2}$' then raise exception 'bad code'; end if;
  insert into events (code, title, status, duration_min, owner)
  values (c, coalesce(nullif(trim(p_title), ''), 'ציד משרות'), 'lobby', greatest(1, least(90, coalesce(p_duration, 12))), null)
  on conflict (code) do update set
    duration_min = case when events.status in ('draft', 'lobby') then excluded.duration_min else events.duration_min end,
    status = case when events.status = 'draft' then 'lobby' else events.status end
  returning * into ev;
  return jsonb_build_object('code', ev.code, 'title', ev.title, 'status', ev.status, 'duration_min', ev.duration_min, 'started_at', ev.started_at, 'server_now', now());
end $$;

-- lobby / live (START, sets the clock) / closed
create or replace function public.host_set_status(p_secret text, p_code text, p_status text, p_duration int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev events;
begin
  if not public.host_ok(p_secret) then raise exception 'bad host key'; end if;
  if p_status not in ('lobby', 'live', 'closed') then raise exception 'bad status'; end if;
  update events set
    status = p_status,
    started_at = case when p_status = 'live' and status <> 'live' then now() when p_status = 'lobby' then null else started_at end,  -- live→live keeps the clock (extend)
    duration_min = case when p_duration is null then duration_min else greatest(1, least(90, p_duration)) end
  where code = upper(trim(p_code))
  returning * into ev;
  if not found then raise exception 'no such event'; end if;
  return jsonb_build_object('code', ev.code, 'title', ev.title, 'status', ev.status, 'duration_min', ev.duration_min, 'started_at', ev.started_at, 'server_now', now());
end $$;

revoke execute on function public.host_ok(text) from public;
grant execute on function public.host_ok(text), public.host_open_event(text,text,text,int),
  public.host_set_status(text,text,text,int) to anon, authenticated;
grant execute on function public.set_host_secret(text) to authenticated;
