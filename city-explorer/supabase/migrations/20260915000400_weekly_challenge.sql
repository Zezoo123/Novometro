-- Weekly challenges rotate automatically: every Monday 00:05 London time a
-- new "line sprint" is created for each city that has none active, picking
-- a rail line the fewest people have completed. Runs via pg_cron; also
-- callable by hand.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.rotate_weekly_challenges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city record;
  v_line record;
  v_start timestamptz := date_trunc('week', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_end   timestamptz := (date_trunc('week', now() at time zone 'Europe/London') + interval '7 days') at time zone 'Europe/London';
  v_target integer;
  v_created integer := 0;
begin
  for v_city in select id from public.cities loop
    if exists (select 1 from public.challenges c where c.city_id = v_city.id and now() >= c.starts_at and now() < c.ends_at) then
      continue;
    end if;

    -- Least-completed rail line with at least 5 stations; random tie-break.
    select l.id, l.name, count(distinct ls.station_id) as stations
    into v_line
    from public.lines l
    join public.line_stations ls on ls.line_id = l.id
    where l.city_id = v_city.id and l.network = 'rail'
    group by l.id
    having count(distinct ls.station_id) >= 5
    order by (
      select count(*) from public.user_achievements ua
      join public.achievements a on a.key = ua.achievement_key
      where a.line_id = l.id
    ), random()
    limit 1;

    if v_line.id is null then continue; end if;

    v_target := least(5, v_line.stations);
    insert into public.challenges (city_id, title, description, kind, line_id, target, points, starts_at, ends_at)
    values (
      v_city.id,
      v_line.name || ' sprint',
      format('Check in at %s different %s stations this week.', v_target, v_line.name),
      'line', v_line.id, v_target, 500, v_start, v_end
    );
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.rotate_weekly_challenges() from public, anon, authenticated;

-- Create this week's challenge now if the city has none (e.g. fresh database).
select public.rotate_weekly_challenges();

-- And every Monday at 00:05 London time (cron runs in UTC; 23:05 Sunday UTC
-- is 00:05 Monday BST, 23:05 GMT in winter, either way before anyone wakes).
select cron.schedule('rotate-weekly-challenges', '5 23 * * 0', $$select public.rotate_weekly_challenges()$$)
where not exists (select 1 from cron.job where jobname = 'rotate-weekly-challenges');
