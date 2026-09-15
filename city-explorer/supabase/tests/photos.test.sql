begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.cities (id, slug, name, country_code, centre_lat, centre_lon)
values ('00000000-0000-0000-0000-0000000000cc', 'phototown', 'Phototown', 'GB', 0.7, 0.14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pia@example.com', '', '{}', now(), now()),
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quin@example.com', '', '{}', now(), now()),
  ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rex@example.com', '', '{}', now(), now());
update public.profiles set username = 'pia'  where id = '10000000-0000-0000-0000-0000000000c1';
update public.profiles set username = 'quin' where id = '10000000-0000-0000-0000-0000000000c2';
update public.profiles set username = 'rex'  where id = '10000000-0000-0000-0000-0000000000c3';

insert into public.lines (id, city_id, external_source, external_id, name, mode, network, colour)
values ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000cc', 'test', 'photo', 'Photo line', 'tube', 'rail', '#123456');
insert into public.stations (id, city_id, external_source, external_id, name, lat, lon, modes, network) values
  ('30000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000cc', 'test', 'p1', 'Snap Street', 0.700, 0.140, '{tube}', 'rail'),
  ('30000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000cc', 'test', 'p2', 'Selfie Square', 0.710, 0.140, '{tube}', 'rail');
insert into public.line_stations (line_id, station_id, branch, sequence) values
  ('20000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c1', 0, 1),
  ('20000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c2', 0, 2);

-- pia posts a photo check-in, then a plain one at another station
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.check_in('30000000-0000-0000-0000-0000000000c1', 0.700, 0.140, 10, false, '10000000-0000-0000-0000-0000000000c2/x.jpg', null) $$,
  'photo_not_owned', 'cannot attach a photo from someone else''s folder');

select lives_ok(
  $$ select public.check_in('30000000-0000-0000-0000-0000000000c1', 0.700, 0.140, 10, false, '10000000-0000-0000-0000-0000000000c1/a.jpg', '  first snap  ') $$,
  'photo check-in succeeds');
select is((select caption from public.visits where photo_path = '10000000-0000-0000-0000-0000000000c1/a.jpg'), 'first snap', 'caption is trimmed');

reset role; update public.visits set visited_at = visited_at - interval '30 minutes'; set local role authenticated;
select lives_ok($$ select public.check_in('30000000-0000-0000-0000-0000000000c2', 0.710, 0.140, 10) $$, 'plain check-in succeeds');

select is(
  (select xp from public.my_stats()),
  2 * 10 + 2 * 40 + 20 + (select sum(a.points)::integer from public.user_achievements ua join public.achievements a on a.key = ua.achievement_key
                          where ua.user_id = '10000000-0000-0000-0000-0000000000c1'),
  'photo check-ins earn 20 extra XP on top of achievement points');

select is((select count(*) from public.feed()), 2::bigint, 'my own check-ins appear in my feed');
select is((select station_name from public.feed(null, 1)), 'Selfie Square', 'feed is newest first');

-- quin: not following pia, sees only the photo (station wall), not the plain visit
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select is((select count(*) from public.visits), 1::bigint, 'strangers see photo check-ins only');
select is((select count(*) from public.feed()), 0::bigint, 'strangers are not in my feed');
select is((select username from public.station_wall('30000000-0000-0000-0000-0000000000c1')), 'pia', 'station wall shows the photo');

insert into public.reactions (visit_id, user_id) select id, '10000000-0000-0000-0000-0000000000c2' from public.visits where photo_path is not null;
insert into public.follows (follower_id, followee_id) values ('10000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1');
select results_eq(
  $$ select reaction_count, my_reaction, is_me from public.feed() where photo_path is not null $$,
  $$ values (1, 'like'::text, false) $$,
  'after following, the feed shows pia''s photo with my reaction');

-- three reports hide the photo
insert into public.reports (visit_id, reporter_id, reason) select id, '10000000-0000-0000-0000-0000000000c2', 'spam' from public.visits where photo_path is not null;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
insert into public.reports (visit_id, reporter_id, reason) select id, '10000000-0000-0000-0000-0000000000c3', 'spam' from public.visits where photo_path is not null;
select is((select count(*) from public.station_wall('30000000-0000-0000-0000-0000000000c1')), 1::bigint, 'two reports do not hide it');
reset role;
insert into public.reports (visit_id, reporter_id, reason) select id, '10000000-0000-0000-0000-0000000000c1', 'spam' from public.visits where photo_path is not null;
set local role authenticated;
select is((select count(*) from public.station_wall('30000000-0000-0000-0000-0000000000c1')), 0::bigint, 'the third report hides it');

select * from finish();
rollback;
