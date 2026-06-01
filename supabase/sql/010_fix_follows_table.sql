do $$
begin
  if to_regclass('public.follows') is null and to_regclass('public.fllows') is not null then
    alter table public.fllows rename to follows;
  end if;
end $$;

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_follower_id_idx on public.follows (follower_id);
create index if not exists follows_following_id_idx on public.follows (following_id);
create index if not exists follows_created_at_idx on public.follows (created_at desc);

alter table public.follows enable row level security;

drop policy if exists "Authenticated users can read follows" on public.follows;
create policy "Authenticated users can read follows"
on public.follows
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own follows" on public.follows;
create policy "Users can insert their own follows"
on public.follows
for insert
to authenticated
with check (auth.uid() = follower_id);

drop policy if exists "Users can delete their own follows" on public.follows;
create policy "Users can delete their own follows"
on public.follows
for delete
to authenticated
using (auth.uid() = follower_id);

notify pgrst, 'reload schema';
