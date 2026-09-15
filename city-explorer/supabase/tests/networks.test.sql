begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.cities (id, slug, name, country_code, centre_lat, centre_lon)
values ('00000000-0000-0000-0000-0000000000bb', 'busville', 'Busville', 'GB', 0.5, 0.14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bus@example.com', '', '{}', now(), now());
update public.profiles set username = 'busfan' where id = '10000000-0000-0000-0000-0000000000bb';

-- One rail line with two stations, one bus route with two stops.
insert into public.lines (id, city_id, external_source, external_id, name, mode, network, colour) values
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000bb', 'test', 'rail1', 'Rail line', 'tube', 'rail', '#000'),
  ('20000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000bb', 'test', '24',    '24',        'bus',  'bus',  '#DC241F');

select is((select points from public.achievements where key = 'line_complete:test:24'), 150, 'bus route completion is worth 150');
select is((select points from public.achievements where key = 'line_complete:test:rail1'), 300, 'rail line completion is worth 300');
select is((select description from public.achievements where key = 'line_complete:test:24'), 'Rode every stop on route 24', 'bus completion copy');

insert into public.stations (id, city_id, external_source, external_id, name, lat, lon, modes, network) values
  ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000bb', 'test', 'r1', 'Rail A', 0.500, 0.140, '{tube}', 'rail'),
  ('30000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000bb', 'test', 'r2', 'Rail B', 0.510, 0.140, '{tube}', 'rail'),
  ('30000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000bb', 'test', 's1', 'Stop 1', 0.520, 0.140, '{bus}',  'bus'),
  ('30000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000bb', 'test', 's2', 'Stop 2', 0.530, 0.140, '{bus}',  'bus');
insert into public.line_stations (line_id, station_id, branch, sequence) values
  ('20000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', 0, 1),
  ('20000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b2', 0, 2),
  ('20000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b3', 0, 1),
  ('20000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b4', 0, 2);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;

-- Ride the whole bus route.
select lives_ok($$ select public.check_in('30000000-0000-0000-0000-0000000000b3', 0.520, 0.140, 10) $$, 'stop 1');
reset role; update public.visits set visited_at = visited_at - interval '30 minutes'; set local role authenticated;

select is(
  (select r->'new_achievements' from public.check_in('30000000-0000-0000-0000-0000000000b4', 0.530, 0.140, 10) r),
  '["line_complete:test:24"]'::jsonb,
  'finishing the bus route completes it but does not award explorer:city or all_lines');

select is(
  (select score from public.leaderboard('00000000-0000-0000-0000-0000000000bb', 'city', 'all') where is_me),
  0, 'bus stops do not count toward the leaderboard');

select results_eq(
  $$ select name, network, total_stations from public.my_line_progress where city_id = '00000000-0000-0000-0000-0000000000bb' order by network, name $$,
  $$ values ('24'::text, 'bus'::text, 2), ('Rail line'::text, 'rail'::text, 2) $$,
  'line progress carries the network');

select is(
  (select name from public.nearest_stations(0.5195, 0.140, 1, 'rail')),
  'Rail B', 'nearest_stations can be limited to a network');

-- Now the rail network: both stations completes the line, the city, and all lines.
reset role; update public.visits set visited_at = visited_at - interval '30 minutes'; set local role authenticated;
select lives_ok($$ select public.check_in('30000000-0000-0000-0000-0000000000b1', 0.500, 0.140, 10) $$, 'rail A');
reset role; update public.visits set visited_at = visited_at - interval '30 minutes'; set local role authenticated;
select is(
  (select r->'new_achievements' from public.check_in('30000000-0000-0000-0000-0000000000b2', 0.510, 0.140, 10) r),
  '["explorer:city", "line_complete:test:rail1", "all_lines"]'::jsonb,
  'rail completion awards city and network achievements, ignoring the bus route');

select * from finish();
rollback;
