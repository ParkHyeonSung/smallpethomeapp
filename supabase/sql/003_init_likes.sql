create or replace function public.sync_post_like_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set like_count = like_count + 1
    where id = new.post_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.posts
    set like_count = greatest(like_count - 1, 0)
    where id = old.post_id;
    return old;
  end if;

  return null;
end;
$$;

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, post_id)
);

create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists likes_post_id_idx on public.likes (post_id);
create index if not exists likes_created_at_idx on public.likes (created_at desc);

drop trigger if exists sync_post_like_count_on_insert on public.likes;
create trigger sync_post_like_count_on_insert
after insert on public.likes
for each row
execute function public.sync_post_like_count();

drop trigger if exists sync_post_like_count_on_delete on public.likes;
create trigger sync_post_like_count_on_delete
after delete on public.likes
for each row
execute function public.sync_post_like_count();

alter table public.likes enable row level security;

drop policy if exists "Authenticated users can read likes" on public.likes;
create policy "Authenticated users can read likes"
on public.likes
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own likes" on public.likes;
create policy "Users can insert their own likes"
on public.likes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own likes" on public.likes;
create policy "Users can delete their own likes"
on public.likes
for delete
to authenticated
using (auth.uid() = user_id);
