create table if not exists public.post_product_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  product_name text not null check (char_length(product_name) between 1 and 80),
  product_url text not null,
  thumbnail_url text,
  x_position numeric(6,5) not null check (x_position >= 0 and x_position <= 1),
  y_position numeric(6,5) not null check (y_position >= 0 and y_position <= 1),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists post_product_tags_post_id_idx on public.post_product_tags (post_id);
create index if not exists post_product_tags_author_id_idx on public.post_product_tags (author_id);

alter table public.post_product_tags enable row level security;

drop policy if exists "Authenticated users can read product tags" on public.post_product_tags;
create policy "Authenticated users can read product tags"
on public.post_product_tags
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own product tags" on public.post_product_tags;
create policy "Users can insert their own product tags"
on public.post_product_tags
for insert
to authenticated
with check (auth.uid() = author_id);

drop policy if exists "Users can update their own product tags" on public.post_product_tags;
create policy "Users can update their own product tags"
on public.post_product_tags
for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Users can delete their own product tags" on public.post_product_tags;
create policy "Users can delete their own product tags"
on public.post_product_tags
for delete
to authenticated
using (auth.uid() = author_id);
