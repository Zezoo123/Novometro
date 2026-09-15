-- Photo check-ins, reactions, reports, and the friends feed.
--
-- A photo is uploaded to the 'checkins' bucket first (path <user_id>/<uuid>.jpg),
-- then check_in() is called with the path. Photo check-ins are visible to
-- everyone signed in (they are the station walls); plain check-ins stay
-- visible only to the owner and their followers.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkins', 'checkins', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "users upload into their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'checkins' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete their own photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'checkins' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "check-in photos are public"
  on storage.objects for select
  using (bucket_id = 'checkins');

-- ---------------------------------------------------------------------------
-- Visits carry the photo
-- ---------------------------------------------------------------------------
alter table public.visits
  add column if not exists photo_path text,
  add column if not exists caption    text check (caption is null or char_length(caption) <= 280),
  add column if not exists hidden     boolean not null default false;

create index if not exists visits_photo_feed_idx on public.visits (visited_at desc) where photo_path is not null and not hidden;
create index if not exists visits_station_photos_idx on public.visits (station_id, visited_at desc) where photo_path is not null and not hidden;

-- Photo check-ins are the station walls: visible to any signed-in user.
create policy "photo check-ins are visible to signed-in users"
  on public.visits for select to authenticated
  using (photo_path is not null and not hidden);

-- Owners can hide (delete) their own photo; the row stays for stats.
create policy "owners can hide their own visits"
  on public.visits for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (hidden, caption) on public.visits to authenticated;

-- ---------------------------------------------------------------------------
-- Reactions and reports
-- ---------------------------------------------------------------------------
create table public.reactions (
  visit_id   uuid not null references public.visits(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'like' check (kind in ('like', 'fire', 'clap')),
  created_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);
create index reactions_visit_idx on public.reactions (visit_id);

alter table public.reactions enable row level security;
create policy "reactions are visible to signed-in users"
  on public.reactions for select to authenticated using (true);
create policy "users react as themselves"
  on public.reactions for insert to authenticated with check (user_id = auth.uid());
create policy "users change their own reaction"
  on public.reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users remove their own reaction"
  on public.reactions for delete to authenticated using (user_id = auth.uid());

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references public.visits(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('inappropriate', 'not_the_station', 'spam', 'other')),
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (visit_id, reporter_id)
);
alter table public.reports enable row level security;
create policy "users report as themselves"
  on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "users see their own reports"
  on public.reports for select to authenticated using (reporter_id = auth.uid());
revoke update, delete on public.reports from anon, authenticated;

-- Three reports hide a photo automatically until someone looks at it.
create or replace function public.handle_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.reports r where r.visit_id = new.visit_id) >= 3 then
    update public.visits set hidden = true where id = new.visit_id;
  end if;
  return new;
end;
$$;
create trigger on_report_created after insert on public.reports
  for each row execute function public.handle_new_report();

-- ---------------------------------------------------------------------------
-- check_in with an optional photo
-- ---------------------------------------------------------------------------
create or replace function public.check_in(
  p_station_id uuid,
  p_lat        double precision,
  p_lon        double precision,
  p_accuracy_m double precision,
  p_mocked     boolean default false,
  p_photo_path text default null,
  p_caption    text default null
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
    raise exception 'location_mocked' using detail = 'Mock location providers are not allowed.';
  end if;

  if p_lat is null or p_lon is null or p_accuracy_m is null
     or p_accuracy_m < 0 or p_accuracy_m > s.max_accuracy_m then
    raise exception 'location_inaccurate' using detail = format('Accuracy must be within %s m.', s.max_accuracy_m);
  end if;

  -- The photo must be the caller's own upload.
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> v_user::text then
    raise exception 'photo_not_owned';
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
    raise exception 'rate_limited' using detail = format('Already checked in here in the last %s.', s.rate_limit);
  end if;

  select * into v_last from public.visits where user_id = v_user order by visited_at desc limit 1;
  if found then
    v_gap_s := greatest(extract(epoch from (now() - v_last.visited_at)), s.min_gap_seconds);
    v_speed := (ST_Distance(ST_SetSRID(ST_MakePoint(v_last.lon, v_last.lat), 4326)::extensions.geography, v_here) / 1000.0)
               / (v_gap_s / 3600.0);
    if v_speed > s.max_speed_kmh then
      raise exception 'implausible_speed' using detail = format('%s km/h since your last check-in.', round(v_speed));
    end if;
  end if;

  insert into public.visits (user_id, station_id, lat, lon, accuracy_m, distance_m, source, photo_path, caption)
  values (v_user, p_station_id, p_lat, p_lon, p_accuracy_m, v_distance, 'checkin', p_photo_path, nullif(trim(p_caption), ''))
  returning id into v_visit_id;

  select count(*) into v_count from public.visits where user_id = v_user and station_id = p_station_id;

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

drop function if exists public.check_in(uuid, double precision, double precision, double precision, boolean);
revoke all on function public.check_in(uuid, double precision, double precision, double precision, boolean, text, text) from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision, double precision, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Feed and station walls
-- ---------------------------------------------------------------------------
-- Friends feed: check-ins by people I follow and by me, newest first, keyset paged.
create or replace function public.feed(p_before timestamptz default null, p_limit integer default 20)
returns table (
  visit_id        uuid,
  user_id         uuid,
  username        text,
  station_id      uuid,
  station_name    text,
  line_colours    text[],
  visited_at      timestamptz,
  photo_path      text,
  caption         text,
  visit_number    integer,
  reaction_count  integer,
  my_reaction     text,
  is_me           boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.id,
    v.user_id,
    p.username,
    v.station_id,
    st.name,
    (select array_agg(l.colour order by l.name) from public.line_stations ls join public.lines l on l.id = ls.line_id
      where ls.station_id = v.station_id and l.network = 'rail'),
    v.visited_at,
    v.photo_path,
    v.caption,
    (select count(*)::integer from public.visits v2 where v2.user_id = v.user_id and v2.station_id = v.station_id and v2.visited_at <= v.visited_at),
    (select count(*)::integer from public.reactions r where r.visit_id = v.id),
    (select r.kind from public.reactions r where r.visit_id = v.id and r.user_id = auth.uid()),
    v.user_id = auth.uid()
  from public.visits v
  join public.profiles p on p.id = v.user_id
  join public.stations st on st.id = v.station_id
  where not v.hidden
    and not p.shadow_banned
    and (v.user_id = auth.uid() or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = v.user_id))
    and (p_before is null or v.visited_at < p_before)
  order by v.visited_at desc
  limit greatest(1, least(p_limit, 50))
$$;

-- Everyone's photos at one station, newest first.
create or replace function public.station_wall(p_station_id uuid, p_limit integer default 30)
returns table (
  visit_id   uuid,
  user_id    uuid,
  username   text,
  visited_at timestamptz,
  photo_path text,
  caption    text
)
language sql
stable
security invoker
set search_path = public
as $$
  select v.id, v.user_id, p.username, v.visited_at, v.photo_path, v.caption
  from public.visits v
  join public.profiles p on p.id = v.user_id
  where v.station_id = p_station_id and v.photo_path is not null and not v.hidden and not p.shadow_banned
  order by v.visited_at desc
  limit greatest(1, least(p_limit, 100))
$$;

-- Photo check-ins earn extra XP.
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
  v_photos integer;
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
    if v_prev >= v_today - 1 then v_cur := v_run; end if;
  end if;

  select count(*), count(distinct station_id), count(*) filter (where photo_path is not null)
  into v_visits, v_stations, v_photos
  from public.visits where user_id = v_me;

  select v_visits * 10 + v_stations * 40 + v_photos * 20 + coalesce((
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
