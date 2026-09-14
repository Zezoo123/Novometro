-- Verified check-in. This is the only way a visit gets written.
--
-- Errors are raised with a machine-readable message so the client can map
-- them to copy: not_authenticated, location_mocked, location_inaccurate,
-- station_not_found, too_far, rate_limited, implausible_speed.

-- Tunables live in one place.
create or replace function public.check_in_settings()
returns table (
  base_radius_m        double precision,
  max_accuracy_bonus_m double precision,
  max_accuracy_m       double precision,
  rate_limit           interval,
  max_speed_kmh        double precision,
  min_gap_seconds      double precision
)
language sql immutable
as $$
  select 150.0, 100.0, 200.0, interval '30 minutes', 250.0, 10.0
$$;

-- ---------------------------------------------------------------------------
-- Achievement evaluation, called after every visit insert.
-- Returns the keys of achievements earned by this visit.
-- ---------------------------------------------------------------------------
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
  v_station_visits   integer;
  v_distinct_visited integer;
  v_city_total       integer;
  v_line             record;
begin
  select city_id into v_city_id from public.stations where id = p_station_id;

  -- first_visit
  if (select count(*) from public.visits where user_id = p_user_id) = 1 then
    insert into public.user_achievements (user_id, achievement_key, visit_id)
    values (p_user_id, 'first_visit', p_visit_id)
    on conflict do nothing
    returning achievement_key into v_key;
    if v_key is not null then v_new := v_new || v_key; end if;
  end if;

  -- station_regular:N (per station)
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

  -- explorer:N and explorer:city
  select count(distinct v.station_id) into v_distinct_visited
  from public.visits v
  join public.stations s on s.id = v.station_id
  where v.user_id = p_user_id and s.city_id = v_city_id;

  select count(*) into v_city_total from public.stations where city_id = v_city_id;

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

  -- line_complete for every line through this station
  for v_line in
    select l.id, a.key
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

  -- all_lines: every line in the city has its completion achievement earned
  if not exists (
    select 1 from public.lines l
    where l.city_id = v_city_id
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

revoke all on function public.evaluate_achievements(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- check_in
-- ---------------------------------------------------------------------------
create or replace function public.check_in(
  p_station_id uuid,
  p_lat        double precision,
  p_lon        double precision,
  p_accuracy_m double precision,
  p_mocked     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s          record;
  v_user     uuid := auth.uid();
  v_station  public.stations%rowtype;
  v_here     extensions.geography;
  v_distance double precision;
  v_radius   double precision;
  v_last     public.visits%rowtype;
  v_gap_s    double precision;
  v_speed    double precision;
  v_visit_id uuid;
  v_count    integer;
  v_new      text[];
begin
  select * into s from public.check_in_settings();

  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if coalesce(p_mocked, false) then
    raise exception 'location_mocked'
      using detail = 'Mock location providers are not allowed.';
  end if;

  if p_lat is null or p_lon is null or p_accuracy_m is null
     or p_accuracy_m < 0 or p_accuracy_m > s.max_accuracy_m then
    raise exception 'location_inaccurate'
      using detail = format('Accuracy must be within %s m.', s.max_accuracy_m);
  end if;

  select * into v_station from public.stations where id = p_station_id;
  if not found then
    raise exception 'station_not_found';
  end if;

  v_here     := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography;
  v_distance := ST_Distance(v_station.geog, v_here);
  v_radius   := s.base_radius_m + least(p_accuracy_m, s.max_accuracy_bonus_m);

  if v_distance > v_radius then
    raise exception 'too_far'
      using detail = format('%s m away, need to be within %s m.', round(v_distance), round(v_radius));
  end if;

  if exists (
    select 1 from public.visits
    where user_id = v_user and station_id = p_station_id
      and visited_at > now() - s.rate_limit
  ) then
    raise exception 'rate_limited'
      using detail = format('Already checked in here in the last %s.', s.rate_limit);
  end if;

  select * into v_last from public.visits
  where user_id = v_user order by visited_at desc limit 1;

  if found then
    v_gap_s := greatest(extract(epoch from (now() - v_last.visited_at)), s.min_gap_seconds);
    v_speed := (ST_Distance(ST_SetSRID(ST_MakePoint(v_last.lon, v_last.lat), 4326)::extensions.geography, v_here) / 1000.0)
               / (v_gap_s / 3600.0);
    if v_speed > s.max_speed_kmh then
      raise exception 'implausible_speed'
        using detail = format('%s km/h since your last check-in.', round(v_speed));
    end if;
  end if;

  insert into public.visits (user_id, station_id, lat, lon, accuracy_m, distance_m, source)
  values (v_user, p_station_id, p_lat, p_lon, p_accuracy_m, v_distance, 'checkin')
  returning id into v_visit_id;

  select count(*) into v_count from public.visits
  where user_id = v_user and station_id = p_station_id;

  v_new := public.evaluate_achievements(v_user, v_visit_id, p_station_id);

  return jsonb_build_object(
    'visit_id',            v_visit_id,
    'station_id',          p_station_id,
    'first_visit',         v_count = 1,
    'station_visit_count', v_count,
    'distance_m',          round(v_distance),
    'new_achievements',    to_jsonb(v_new)
  );
end;
$$;

revoke all on function public.check_in(uuid, double precision, double precision, double precision, boolean) from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision, double precision, boolean) to authenticated;

-- Nearest stations to a point, for the check-in button.
create or replace function public.nearest_stations(
  p_lat   double precision,
  p_lon   double precision,
  p_limit integer default 5
)
returns table (
  id         uuid,
  name       text,
  lat        double precision,
  lon        double precision,
  distance_m double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select s.id, s.name, s.lat, s.lon,
         ST_Distance(s.geog, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography) as distance_m
  from public.stations s
  order by s.geog <-> ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography
  limit p_limit
$$;
