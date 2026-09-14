-- Share tracking: one row per time a user opens the share sheet for an
-- achievement card. Lets us measure the acquisition loop.

create table public.share_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_key text references public.achievements(key) on delete set null,
  channel         text,            -- what the share sheet reported, if anything
  created_at      timestamptz not null default now()
);
create index share_events_user_idx on public.share_events (user_id, created_at desc);

alter table public.share_events enable row level security;

create policy "users insert their own share events"
  on public.share_events for insert to authenticated
  with check (user_id = auth.uid());

create policy "users read their own share events"
  on public.share_events for select to authenticated
  using (user_id = auth.uid());

revoke update, delete on public.share_events from anon, authenticated;
