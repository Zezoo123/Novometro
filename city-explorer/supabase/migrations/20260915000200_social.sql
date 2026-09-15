-- Social layer: follows, follower-visible activity, profile search,
-- leaderboards, weekly challenges, and streak / XP stats.

-- ---------------------------------------------------------------------------
-- Points per achievement (XP source)
-- ---------------------------------------------------------------------------
alter table public.achievements add column if not exists points integer not null default 100;

update public.achievements set points = case kind
  when 'first_visit'     then 50
  when 'station_regular' then coalesce(threshold, 10) * 5      -- 50 / 250 / 500
  when 'explorer'        then coalesce(threshold * 8, 1500)     -- 200 / 800 / 1500 (city)
  when 'line_complete'   then 300
  when 'all_lines'       then 3000
  else 100 end;

-- Line completions created later get their points from the trigger.
create or replace function public.handle_new_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.achievements (key, kind, line_id, name, description, points)
  values (
    'line_complete:' || new.external_source || ':' || new.external_id,
    'line_complete',
    new.id,
    new.name || ' complete',
    'Visited every station on the ' || new.name,
    300
  )
  on conflict (key) do update set name = excluded.name, description = excluded.description;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

create policy "users see follows they are part of"
  on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());
create policy "users follow as themselves"
  on public.follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy "users unfollow as themselves"
  on public.follows for delete to authenticated
  using (follower_id = auth.uid());
revoke update on public.follows from anon, authenticated;

-- Followers can see what the people they follow have done.
create policy "followers read visits"
  on public.visits for select to authenticated
  using (exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.followee_id = visits.user_id
  ));
create policy "followers read achievements"
  on public.user_achievements for select to authenticated
  using (exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.followee_id = user_achievements.user_id
  ));

-- ---------------------------------------------------------------------------
-- Profile search
-- ---------------------------------------------------------------------------
create or replace function public.search_profiles(p_query text, p_limit integer default 20)
returns table (
  id           uuid,
  username     text,
  display_name text,
  avatar_url   text,
  is_following boolean,
  follows_me   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id) as is_following,
         exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid()) as follows_me
  from public.profiles p
  where p.username is not null
    and p.id <> auth.uid()
    and not p.shadow_banned
    and p.username like lower(regexp_replace(coalesce(p_query, ''), '[^a-z0-9_]', '', 'g')) || '%'
  order by p.username
  limit greatest(1, least(p_limit, 50))
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard
--   scope:  'city' (everyone) | 'friends' (people I follow, plus me)
--   period: 'all' (distinct stations unlocked) | 'week' (visits since Monday)
-- Returns the top N plus the caller's own row if they are outside it.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard(
  p_city_id uuid,
  p_scope   text default 'city',
  p_period  text default 'all',
  p_limit   integer default 50
)
returns table (
  rank         integer,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  score        integer,
  is_me        boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_since timestamptz := case when p_period = 'week' then date_trunc('week', now() at time zone 'Europe/London') at time zone 'Europe/London' else '-infinity' end;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  with scoped as (
    select p.id, p.username, p.display_name, p.avatar_url
    from public.profiles p
    where p.username is not null and not p.shadow_banned
      and (
        p_scope <> 'friends'
        or p.id = v_me
        or exists (select 1 from public.follows f where f.follower_id = v_me and f.followee_id = p.id)
      )
  ),
  scores as (
    select s.id, s.username, s.display_name, s.avatar_url,
      case when p_period = 'week'
        then (select count(*) from public.visits v join public.stations st on st.id = v.station_id
              where v.user_id = s.id and st.city_id = p_city_id and v.visited_at >= v_since)
        else (select count(distinct v.station_id) from public.visits v join public.stations st on st.id = v.station_id
              where v.user_id = s.id and st.city_id = p_city_id)
      end::integer as score
    from scoped s
  ),
  ranked as (
    select sc.*, rank() over (order by sc.score desc, sc.username) ::integer as rnk
    from scores sc
  )
  select r.rnk, r.id, r.username, r.display_name, r.avatar_url, r.score, r.id = v_me
  from ranked r
  where r.rnk <= greatest(1, least(p_limit, 100)) or r.id = v_me
  order by r.rnk;
end;
$$;

revoke all on function public.leaderboard(uuid, text, text, integer) from public, anon;
grant execute on function public.leaderboard(uuid, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Challenges: a rotating goal with bonus points
-- ---------------------------------------------------------------------------
create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references public.cities(id) on delete cascade,
  title       text not null,
  description text not null,
  kind        text not null check (kind in ('line', 'stations', 'any')),
  line_id     uuid references public.lines(id) on delete cascade,
  station_ids uuid[],
  target      integer not null check (target > 0),
  points      integer not null default 500,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  check (ends_at > starts_at)
);
create index challenges_window_idx on public.challenges (city_id, starts_at, ends_at);

alter table public.challenges enable row level security;
create policy "challenges are public" on public.challenges for select using (true);
revoke insert, update, delete on public.challenges from anon, authenticated;

-- Active challenges for the caller with their progress.
create or replace function public.my_challenges(p_city_id uuid)
returns table (
  id          uuid,
  title       text,
  description text,
  kind        text,
  line_id     uuid,
  target      integer,
  points      integer,
  starts_at   timestamptz,
  ends_at     timestamptz,
  progress    integer,
  completed   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.title, c.description, c.kind, c.line_id, c.target, c.points, c.starts_at, c.ends_at,
    least(c.target, (
      select count(distinct v.station_id)::integer
      from public.visits v
      where v.user_id = auth.uid()
        and v.visited_at >= c.starts_at and v.visited_at < c.ends_at
        and (
          (c.kind = 'line' and exists (select 1 from public.line_stations ls where ls.line_id = c.line_id and ls.station_id = v.station_id))
          or (c.kind = 'stations' and v.station_id = any (c.station_ids))
          or (c.kind = 'any' and exists (select 1 from public.stations s where s.id = v.station_id and s.city_id = c.city_id))
        )
    )) as progress,
    false as completed
  from public.challenges c
  where c.city_id = p_city_id and now() >= c.starts_at and now() < c.ends_at
  order by c.ends_at
$$;

-- ---------------------------------------------------------------------------
-- Stats: streak, XP, level
-- ---------------------------------------------------------------------------
create or replace function public.level_for_xp(p_xp integer)
returns integer
language sql immutable
as $$
  -- Level n needs 100 * n^2 XP: 100, 400, 900, 1600 ...
  select greatest(1, floor(sqrt(greatest(p_xp, 0) / 100.0))::integer + 1)
$$;

create or replace function public.my_stats()
returns table (
  current_streak  integer,
  longest_streak  integer,
  xp              integer,
  level           integer,
  xp_into_level   integer,
  xp_for_next     integer,
  visits          integer,
  stations        integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_days date[];
  v_cur integer := 0;
  v_best integer := 0;
  v_run integer := 0;
  v_prev date := null;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_xp integer;
  v_level integer;
  v_visits integer;
  v_stations integer;
  d date;
begin
  select array_agg(day order by day) into v_days
  from (select distinct (visited_at at time zone 'Europe/London')::date as day from public.visits where user_id = v_me) t;

  if v_days is not null then
    foreach d in array v_days loop
      if v_prev is not null and d = v_prev + 1 then v_run := v_run + 1; else v_run := 1; end if;
      v_best := greatest(v_best, v_run);
      v_prev := d;
    end loop;
    -- The streak is alive if the last active day is today or yesterday.
    if v_prev >= v_today - 1 then v_cur := v_run; end if;
  end if;

  select count(*), count(distinct station_id) into v_visits, v_stations from public.visits where user_id = v_me;

  select v_visits * 10 + v_stations * 40 + coalesce((
    select sum(a.points) from public.user_achievements ua join public.achievements a on a.key = ua.achievement_key
    where ua.user_id = v_me), 0)
  into v_xp;

  v_level := public.level_for_xp(v_xp);

  return query select
    v_cur, v_best, v_xp, v_level,
    v_xp - 100 * (v_level - 1) * (v_level - 1),
    100 * v_level * v_level - 100 * (v_level - 1) * (v_level - 1),
    v_visits, v_stations;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed: this week's challenge for London (Victoria line sprint)
-- ---------------------------------------------------------------------------
insert into public.challenges (city_id, title, description, kind, line_id, target, points, starts_at, ends_at)
select
  '00000000-0000-0000-0000-000000000001',
  'Victoria line sprint',
  'Check in at 5 different Victoria line stations this week.',
  'line', l.id, 5, 500,
  date_trunc('week', now() at time zone 'Europe/London') at time zone 'Europe/London',
  (date_trunc('week', now() at time zone 'Europe/London') + interval '7 days') at time zone 'Europe/London'
from public.lines l
where l.external_source = 'tfl' and l.external_id = 'victoria'
on conflict do nothing;
