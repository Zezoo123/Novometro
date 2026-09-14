-- Novometro core schema.
-- Reference data (cities, lines, stations, line_stations) is public-read.
-- User data (profiles, visits, user_achievements) is owner-read and only written
-- by security-definer functions. The client never inserts a visit directly.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.cities (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  country_code char(2) not null,
  centre_lat   double precision not null,
  centre_lon   double precision not null,
  created_at   timestamptz not null default now()
);

create table public.lines (
  id              uuid primary key default gen_random_uuid(),
  city_id         uuid not null references public.cities(id) on delete cascade,
  external_source text not null,
  external_id     text not null,
  name            text not null,
  mode            text not null,
  colour          text,
  -- GeoJSON MultiLineString coordinates ([[ [lon,lat], ... ], ...]) for drawing the line
  geometry        jsonb,
  created_at      timestamptz not null default now(),
  unique (external_source, external_id)
);
create index lines_city_idx on public.lines (city_id);

create table public.stations (
  id              uuid primary key default gen_random_uuid(),
  city_id         uuid not null references public.cities(id) on delete cascade,
  external_source text not null,
  external_id     text not null,
  name            text not null,
  lat             double precision not null,
  lon             double precision not null,
  modes           text[] not null default '{}',
  -- Interchange grouping (TfL hub code). Stations sharing a hub are one physical place.
  hub_id          text,
  geog            extensions.geography(Point, 4326)
                  generated always as (
                    extensions.ST_SetSRID(extensions.ST_MakePoint(lon, lat), 4326)::extensions.geography
                  ) stored,
  created_at      timestamptz not null default now(),
  unique (external_source, external_id)
);
create index stations_geog_idx on public.stations using gist (geog);
create index stations_city_idx on public.stations (city_id);

-- Ordered station sequence per line. A line can have several branches
-- (e.g. Northern), so the key includes the branch.
create table public.line_stations (
  line_id    uuid not null references public.lines(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  branch     smallint not null default 0,
  sequence   integer not null,
  primary key (line_id, station_id, branch)
);
create index line_stations_station_idx on public.line_stations (station_id);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text,
  avatar_url    text,
  home_city_id  uuid references public.cities(id),
  shadow_banned boolean not null default false,
  created_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Visits: append-only event log. Everything else (unlocks, counts, streaks,
-- achievements, leaderboards) derives from this table.
-- ---------------------------------------------------------------------------

create table public.visits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  station_id  uuid not null references public.stations(id) on delete cascade,
  visited_at  timestamptz not null default now(),
  lat         double precision not null,
  lon         double precision not null,
  accuracy_m  double precision not null,
  distance_m  double precision not null,
  source      text not null default 'checkin' check (source in ('checkin', 'passive')),
  flags       text[] not null default '{}'
);
create index visits_user_station_idx on public.visits (user_id, station_id, visited_at desc);
create index visits_user_time_idx    on public.visits (user_id, visited_at desc);
create index visits_station_idx      on public.visits (station_id);

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------

create table public.achievements (
  key         text primary key,
  kind        text not null check (kind in ('first_visit', 'line_complete', 'station_regular', 'explorer', 'all_lines')),
  threshold   integer,
  line_id     uuid references public.lines(id) on delete cascade,
  name        text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

create table public.user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key) on delete cascade,
  -- station_regular is earned per station; other kinds leave this null.
  station_id      uuid references public.stations(id) on delete cascade,
  visit_id        uuid references public.visits(id) on delete set null,
  earned_at       timestamptz not null default now(),
  unique nulls not distinct (user_id, achievement_key, station_id)
);
create index user_achievements_user_idx on public.user_achievements (user_id, earned_at desc);

insert into public.achievements (key, kind, threshold, name, description) values
  ('first_visit',         'first_visit',     null, 'First steps',        'Checked in at your first station'),
  ('station_regular:10',  'station_regular', 10,   'Regular',            '10 visits to the same station'),
  ('station_regular:50',  'station_regular', 50,   'Local',              '50 visits to the same station'),
  ('station_regular:100', 'station_regular', 100,  'Part of the furniture', '100 visits to the same station'),
  ('explorer:25',         'explorer',        25,   'Explorer',           'Unlocked 25 stations'),
  ('explorer:100',        'explorer',        100,  'Cartographer',       'Unlocked 100 stations'),
  ('explorer:city',       'explorer',        null, 'Completionist',      'Unlocked every station in a city'),
  ('all_lines',           'all_lines',       null, 'Network master',     'Completed every line in a city');

-- Every line gets its own completion achievement automatically.
create or replace function public.handle_new_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.achievements (key, kind, line_id, name, description)
  values (
    'line_complete:' || new.external_source || ':' || new.external_id,
    'line_complete',
    new.id,
    new.name || ' complete',
    'Visited every station on the ' || new.name
  )
  on conflict (key) do update set name = excluded.name, description = excluded.description;
  return new;
end;
$$;

create trigger on_line_created
  after insert or update of name on public.lines
  for each row execute function public.handle_new_line();

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS on the underlying tables applies)
-- ---------------------------------------------------------------------------

create view public.station_visit_counts
with (security_invoker = true) as
select
  user_id,
  station_id,
  count(*)::integer as visits,
  min(visited_at)   as first_visited_at,
  max(visited_at)   as last_visited_at
from public.visits
group by user_id, station_id;

-- Progress of the calling user on every line.
create view public.my_line_progress
with (security_invoker = true) as
select
  l.id      as line_id,
  l.city_id,
  l.name,
  l.mode,
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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.cities            enable row level security;
alter table public.lines             enable row level security;
alter table public.stations          enable row level security;
alter table public.line_stations     enable row level security;
alter table public.achievements      enable row level security;
alter table public.profiles          enable row level security;
alter table public.visits            enable row level security;
alter table public.user_achievements enable row level security;

create policy "cities are public"        on public.cities        for select using (true);
create policy "lines are public"         on public.lines         for select using (true);
create policy "stations are public"      on public.stations      for select using (true);
create policy "line_stations are public" on public.line_stations for select using (true);
create policy "achievements are public"  on public.achievements  for select using (true);

create policy "profiles are readable by signed-in users"
  on public.profiles for select to authenticated using (true);
create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "users read their own visits"
  on public.visits for select to authenticated using (user_id = auth.uid());

create policy "users read their own achievements"
  on public.user_achievements for select to authenticated using (user_id = auth.uid());

-- Belt and braces: even if a permissive policy is added later by mistake,
-- the client roles have no write privilege on these tables at all.
revoke insert, update, delete on public.visits            from anon, authenticated;
revoke insert, update, delete on public.user_achievements from anon, authenticated;
revoke insert, delete         on public.profiles          from anon, authenticated;
revoke insert, update, delete on public.cities, public.lines, public.stations,
                                 public.line_stations, public.achievements
                              from anon, authenticated;
