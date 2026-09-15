-- Networks: rail (tube, DLR, Overground, Elizabeth line) and bus live in the
-- same tables but are scored separately. City-wide achievements
-- (explorer:city, all_lines) are scoped to the rail network so 19k bus
-- stops do not make them unreachable; bus gets its own line completions.

alter table public.lines    add column if not exists network text not null default 'rail' check (network in ('rail', 'bus'));
alter table public.stations add column if not exists network text not null default 'rail' check (network in ('rail', 'bus'));

create index if not exists lines_network_idx    on public.lines (city_id, network);
create index if not exists stations_network_idx on public.stations (city_id, network);

update public.lines    set network = 'bus' where mode = 'bus';
update public.stations set network = 'bus' where modes = '{bus}';

-- Explorer thresholds and city completion count rail stations only.
create or replace function public.evaluate_achievements(
  p_user_id    uuid,
  p_visit_id   uuid,
  p_station_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new              text[] := '{}';
  v_key              text;
  v_city_id          uuid;
  v_network          text;
  v_station_visits   integer;
  v_distinct_visited integer;
  v_city_total       integer;
  v_line             record;
begin
  select city_id, network into v_city_id, v_network from public.stations where id = p_station_id;

  -- first_visit
  if (select count(*) from public.visits where user_id = p_user_id) = 1 then
    insert into public.user_achievements (user_id, achievement_key, visit_id)
    values (p_user_id, 'first_visit', p_visit_id)
    on conflict do nothing
    returning achievement_key into v_key;
    if v_key is not null then v_new := v_new || v_key; end if;
  end if;

  -- station_regular:N (per station, any network)
  select count(*) into v_station_visits
  from public.visits where user_id = p_user_id and station_id = p_station_id;

  for v_key in
    select a.key from public.achievements a
    where a.kind = 'station_regular' and a.threshold = v_station_visits
    order by a.threshold
  loop
    insert into public.user_achievements (user_id, achievement_key, station_id, visit_id)
    values (p_user_id, v_key, p_station_id, p_visit_id)
    on conflict do nothing
    returning achievement_key into v_key;
    if v_key is not null then v_new := v_new || v_key; end if;
  end loop;

  -- explorer:N and explorer:city (rail only)
  if v_network = 'rail' then
    select count(distinct v.station_id) into v_distinct_visited
    from public.visits v
    join public.stations s on s.id = v.station_id
    where v.user_id = p_user_id and s.city_id = v_city_id and s.network = 'rail';

    select count(*) into v_city_total from public.stations where city_id = v_city_id and network = 'rail';

    for v_key in
      select a.key from public.achievements a
      where a.kind = 'explorer'
        and (
          (a.threshold is not null and a.threshold <= v_distinct_visited)
          or (a.threshold is null and v_distinct_visited >= v_city_total)
        )
      order by a.threshold nulls last
    loop
      insert into public.user_achievements (user_id, achievement_key, visit_id)
      values (p_user_id, v_key, p_visit_id)
      on conflict do nothing
      returning achievement_key into v_key;
      if v_key is not null then v_new := v_new || v_key; end if;
    end loop;
  end if;

  -- line_complete for every line through this station (rail and bus)
  for v_line in
    select l.id, l.network, a.key
    from public.line_stations ls
    join public.lines l on l.id = ls.line_id
    join public.achievements a on a.kind = 'line_complete' and a.line_id = l.id
    where ls.station_id = p_station_id
  loop
    if not exists (
      select 1
      from public.line_stations ls
      where ls.line_id = v_line.id
        and not exists (
          select 1 from public.visits v
          where v.user_id = p_user_id and v.station_id = ls.station_id
        )
    ) then
      insert into public.user_achievements (user_id, achievement_key, visit_id)
      values (p_user_id, v_line.key, p_visit_id)
      on conflict do nothing
      returning achievement_key into v_key;
      if v_key is not null then v_new := v_new || v_key; end if;
    end if;
  end loop;

  -- all_lines: every rail line in the city complete
  if v_network = 'rail' and not exists (
    select 1 from public.lines l
    where l.city_id = v_city_id and l.network = 'rail'
      and not exists (
        select 1
        from public.user_achievements ua
        join public.achievements a on a.key = ua.achievement_key
        where ua.user_id = p_user_id and a.kind = 'line_complete' and a.line_id = l.id
      )
  ) then
    insert into public.user_achievements (user_id, achievement_key, visit_id)
    values (p_user_id, 'all_lines', p_visit_id)
    on conflict do nothing
    returning achievement_key into v_key;
    if v_key is not null then v_new := v_new || v_key; end if;
  end if;

  return v_new;
end;
$$;

-- Bus routes complete for fewer points than a Tube line.
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
    case when new.network = 'bus' then 'Rode every stop on route ' || new.name
         else 'Visited every station on the ' || new.name end,
    case when new.network = 'bus' then 150 else 300 end
  )
  on conflict (key) do update set name = excluded.name, description = excluded.description, points = excluded.points;
  return new;
end;
$$;

-- Line progress carries the network so the app can group and filter.
-- (drop first: a replaced view cannot gain a column in the middle)
drop view if exists public.my_line_progress;
create view public.my_line_progress
with (security_invoker = true) as
select
  l.id      as line_id,
  l.city_id,
  l.name,
  l.mode,
  l.network,
  l.colour,
  count(distinct ls.station_id)::integer as total_stations,
  count(distinct ls.station_id) filter (
    where exists (
      select 1 from public.visits v
      where v.user_id = auth.uid() and v.station_id = ls.station_id
    )
  )::integer as visited_stations
from public.lines l
join public.line_stations ls on ls.line_id = l.id
group by l.id;

-- Leaderboards score rail stations; bus is a bonus track, not the race.
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
              where v.user_id = s.id and st.city_id = p_city_id and st.network = 'rail' and v.visited_at >= v_since)
        else (select count(distinct v.station_id) from public.visits v join public.stations st on st.id = v.station_id
              where v.user_id = s.id and st.city_id = p_city_id and st.network = 'rail')
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

-- Nearest stations can be limited to a network (the check-in bar follows the map filter).
create or replace function public.nearest_stations(
  p_lat     double precision,
  p_lon     double precision,
  p_limit   integer default 5,
  p_network text default null
)
returns table (
  id         uuid,
  name       text,
  lat        double precision,
  lon        double precision,
  network    text,
  distance_m double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select s.id, s.name, s.lat, s.lon, s.network,
         ST_Distance(s.geog, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography) as distance_m
  from public.stations s
  where p_network is null or s.network = p_network
  order by s.geog <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography
  limit p_limit
$$;
drop function if exists public.nearest_stations(double precision, double precision, integer);
