begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Own city so the assertions do not depend on whatever real data is imported.
insert into public.cities (id, slug, name, country_code, centre_lat, centre_lon)
values ('00000000-0000-0000-0000-00000000cafe', 'testville', 'Testville', 'GB', 51.5, -0.14);


-- ---------------------------------------------------------------------------
-- Fixtures: two users, one line with three stations
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@example.com', '', '{"name":"Alice"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@example.com',   '', '{"name":"Bob"}',   now(), now());

select is(
  (select count(*) from public.profiles where id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')),
  2::bigint, 'signup trigger creates profiles');

insert into public.lines (id, city_id, external_source, external_id, name, mode, colour)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000cafe', 'test', 'victoria', 'Victoria line', 'tube', '#0098D4');

select is(
  (select count(*) from public.achievements where key = 'line_complete:test:victoria'),
  1::bigint, 'line insert creates its completion achievement');

-- Victoria, Green Park, Oxford Circus (real coordinates)
insert into public.stations (id, city_id, external_source, external_id, name, lat, lon, modes) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000cafe', 'test', 'vic', 'Victoria',      51.4965, -0.1447, '{tube}'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000cafe', 'test', 'gpk', 'Green Park',    51.5067, -0.1428, '{tube}'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000cafe', 'test', 'oxc', 'Oxford Circus', 51.5154, -0.1411, '{tube}');

insert into public.line_stations (line_id, station_id, branch, sequence) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 0, 1),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 2),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 0, 3);

-- ---------------------------------------------------------------------------
-- Unauthenticated
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.check_in('30000000-0000-0000-0000-000000000001', 51.4965, -0.1447, 10) $$,
  'not_authenticated', 'anonymous callers are rejected');

-- ---------------------------------------------------------------------------
-- Act as Alice
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.visits (user_id, station_id, lat, lon, accuracy_m, distance_m)
     values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 0, 0, 0, 0) $$,
  '42501', 'permission denied for table visits', 'clients cannot insert visits directly');

select throws_ok(
  $$ select public.check_in('30000000-0000-0000-0000-000000000001', 51.4965, -0.1447, 10, true) $$,
  'location_mocked', 'mocked locations are rejected');

select throws_ok(
  $$ select public.check_in('30000000-0000-0000-0000-000000000001', 51.4965, -0.1447, 500) $$,
  'location_inaccurate', 'poor accuracy is rejected');

select throws_ok(
  $$ select public.check_in('30000000-0000-0000-0000-000000000001', 51.5067, -0.1428, 10) $$,
  'too_far', 'being at Green Park does not unlock Victoria');

select throws_ok(
  $$ select public.check_in('99999999-0000-0000-0000-000000000000', 51.4965, -0.1447, 10) $$,
  'station_not_found', 'unknown station is rejected');

-- Happy path: ~40 m from the station point
select is(
  (select r->>'first_visit' from public.check_in('30000000-0000-0000-0000-000000000001', 51.4968, -0.1450, 15) r),
  'true', 'first check-in at Victoria succeeds and is flagged first_visit');

-- Simulate 20 minutes passing (transactions freeze now(), so backdate as superuser)
reset role;
update public.visits set visited_at = visited_at - interval '20 minutes';
set local role authenticated;

select is(
  (select r->'new_achievements' from public.check_in('30000000-0000-0000-0000-000000000002', 51.5067, -0.1428, 15) r),
  '[]'::jsonb, 'second station: no new achievements yet');

reset role;
update public.visits set visited_at = visited_at - interval '20 minutes';
set local role authenticated;

select is(
  (select count(*) from public.visits), 2::bigint, 'alice can read her own two visits');

select is(
  (select r->'new_achievements' from public.check_in('30000000-0000-0000-0000-000000000003', 51.5154, -0.1411, 15) r),
  '["explorer:city", "line_complete:test:victoria", "all_lines"]'::jsonb,
  'third station completes the city, the line and, with one line in the city, the network');

select is(
  (select array_agg(achievement_key order by achievement_key) from public.user_achievements),
  array['all_lines', 'explorer:city', 'first_visit', 'line_complete:test:victoria'],
  'alice holds exactly the four expected achievements');

select is(
  (select count(*) from public.station_visit_counts), 3::bigint,
  'station_visit_counts has one row per station for alice');

select throws_ok(
  $$ select public.check_in('30000000-0000-0000-0000-000000000003', 51.5154, -0.1411, 15) $$,
  'rate_limited', 'immediate second check-in at the same station is rate limited');

select is(
  (select visited_stations from public.my_line_progress where line_id = '20000000-0000-0000-0000-000000000001'),
  3, 'my_line_progress reports 3 of 3 for alice');

-- ---------------------------------------------------------------------------
-- Act as Bob: isolation and speed check
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*) from public.visits), 0::bigint, 'bob cannot see alice''s visits');
select is((select count(*) from public.user_achievements), 0::bigint, 'bob cannot see alice''s achievements');

select lives_ok(
  $$ select public.check_in('30000000-0000-0000-0000-000000000001', 51.4965, -0.1447, 10) $$,
  'bob checks in at Victoria');

-- Oxford Circus is ~2.1 km from Victoria; within the 10 s minimum gap that is ~760 km/h
select throws_ok(
  $$ select public.check_in('30000000-0000-0000-0000-000000000003', 51.5154, -0.1411, 10) $$,
  'implausible_speed', 'teleporting 2 km in seconds is rejected');

select * from finish();
rollback;
