begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Own city and line so real data does not affect the assertions.
insert into public.cities (id, slug, name, country_code, centre_lat, centre_lon)
values ('00000000-0000-0000-0000-00000000beef', 'testopolis', 'Testopolis', 'GB', 51.5, -0.14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@example.com', '', '{}', now(), now()),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ben@example.com', '', '{}', now(), now()),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'cyr@example.com',  '', '{}', now(), now());
update public.profiles set username = 'ana' where id = '10000000-0000-0000-0000-00000000000a';
update public.profiles set username = 'ben' where id = '10000000-0000-0000-0000-00000000000b';
update public.profiles set username = 'cyr'  where id = '10000000-0000-0000-0000-00000000000c';

insert into public.lines (id, city_id, external_source, external_id, name, mode, colour)
values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000beef', 'test', 'loop', 'Loop line', 'tube', '#000000');

select is((select points from public.achievements where key = 'line_complete:test:loop'), 300, 'line completion achievements carry points');

insert into public.stations (id, city_id, external_source, external_id, name, lat, lon) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000beef', 'test', 'a', 'Alpha', 51.500, -0.140),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000beef', 'test', 'b', 'Beta',  51.510, -0.140),
  ('30000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000beef', 'test', 'c', 'Gamma', 51.520, -0.140);
insert into public.line_stations (line_id, station_id, branch, sequence) values
  ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 0, 1),
  ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b', 0, 2),
  ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000c', 0, 3);

-- Visits written directly as superuser to set up history:
--   ana: Alpha (3 days ago), Beta (yesterday), Alpha again (today)  -> streak 2, 2 stations
--   ben: Gamma (today)
insert into public.visits (user_id, station_id, visited_at, lat, lon, accuracy_m, distance_m) values
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', now() - interval '3 days', 0, 0, 5, 10),
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b', now() - interval '1 day',  0, 0, 5, 10),
  ('10000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', now(),                     0, 0, 5, 10),
  ('10000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000c', now(),                     0, 0, 5, 10);
insert into public.user_achievements (user_id, achievement_key) values ('10000000-0000-0000-0000-00000000000a', 'first_visit');

insert into public.challenges (city_id, title, description, kind, line_id, target, points, starts_at, ends_at)
values ('00000000-0000-0000-0000-00000000beef', 'Loop sprint', 'Visit 3 Loop stations', 'line',
        '20000000-0000-0000-0000-00000000000a', 3, 500, now() - interval '2 days', now() + interval '5 days');

-- ---------------------------------------------------------------------------
-- Act as ana
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.visits), 3::bigint, 'ana sees only her own visits before following anyone');

select results_eq(
  $$ select username, is_following from public.search_profiles('b') $$,
  $$ values ('ben'::text, false) $$,
  'search finds ben by prefix and shows not following');

insert into public.follows (follower_id, followee_id) values ('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b');

select throws_ok(
  $$ insert into public.follows (follower_id, followee_id) values ('10000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a') $$,
  '42501', 'new row violates row-level security policy for table "follows"', 'cannot create follows on behalf of someone else');

select is((select count(*) from public.visits), 4::bigint, 'after following ben, ana sees his visit too');
select is((select is_following from public.search_profiles('ben')), true, 'search reflects the follow');

select results_eq(
  $$ select rank, username, score, is_me from public.leaderboard('00000000-0000-0000-0000-00000000beef', 'city', 'all') where username in ('ana', 'ben', 'cyr') $$,
  $$ values (1, 'ana'::text, 2, true), (2, 'ben'::text, 1, false), (3, 'cyr'::text, 0, false) $$,
  'city all-time leaderboard ranks by distinct stations');

select results_eq(
  $$ select username from public.leaderboard('00000000-0000-0000-0000-00000000beef', 'friends', 'all') $$,
  $$ values ('ana'::text), ('ben'::text) $$,
  'friends scope is me plus who I follow');

select is(
  (select score from public.leaderboard('00000000-0000-0000-0000-00000000beef', 'city', 'week') where username = 'ana'),
  (select count(*)::integer from public.visits v where v.user_id = '10000000-0000-0000-0000-00000000000a'
     and v.visited_at >= date_trunc('week', now() at time zone 'Europe/London') at time zone 'Europe/London'),
  'weekly leaderboard counts visits since Monday');

select results_eq(
  $$ select current_streak, longest_streak, visits, stations from public.my_stats() $$,
  $$ values (2, 2, 3, 2) $$,
  'streak is 2 (yesterday + today), longest 2, 3 visits, 2 stations');

select is((select xp from public.my_stats()), 3 * 10 + 2 * 40 + 50, 'xp = visits*10 + stations*40 + achievement points');
select is((select level from public.my_stats()), 2, '160 xp is level 2');
select is(public.level_for_xp(0), 1, 'level 1 at 0 xp');
select is(public.level_for_xp(400), 3, 'level 3 at 400 xp');

select results_eq(
  $$ select title, progress, target from public.my_challenges('00000000-0000-0000-0000-00000000beef') $$,
  $$ values ('Loop sprint'::text, 2, 3) $$,
  'challenge progress counts distinct stations within the window');

-- ---------------------------------------------------------------------------
-- Act as cy: no follows, sees nothing of the others
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*) from public.visits), 0::bigint, 'cy sees no visits');
select ok(
  exists (select 1 from public.leaderboard('00000000-0000-0000-0000-00000000beef', 'city', 'all', 1) where is_me),
  'top-1 leaderboard still includes the caller''s own row');

select * from finish();
rollback;
