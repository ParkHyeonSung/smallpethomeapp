create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  image_url text not null,
  image_path text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists post_images_post_id_idx on public.post_images (post_id);
create index if not exists post_images_post_id_sort_order_idx
on public.post_images (post_id, sort_order asc);

alter table public.post_images enable row level security;

drop policy if exists "Authenticated users can read post images for visible posts" on public.post_images;
create policy "Authenticated users can read post images for visible posts"
on public.post_images
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    where public.posts.id = post_images.post_id
      and (public.posts.is_public = true or public.posts.author_id = auth.uid())
  )
);

drop policy if exists "Users can insert images for their own posts" on public.post_images;
create policy "Users can insert images for their own posts"
on public.post_images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.posts
    where public.posts.id = post_images.post_id
      and public.posts.author_id = auth.uid()
  )
);

drop policy if exists "Users can update images for their own posts" on public.post_images;
create policy "Users can update images for their own posts"
on public.post_images
for update
to authenticated
using (
  exists (
    select 1
    from public.posts
    where public.posts.id = post_images.post_id
      and public.posts.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts
    where public.posts.id = post_images.post_id
      and public.posts.author_id = auth.uid()
  )
);

drop policy if exists "Users can delete images for their own posts" on public.post_images;
create policy "Users can delete images for their own posts"
on public.post_images
for delete
to authenticated
using (
  exists (
    select 1
    from public.posts
    where public.posts.id = post_images.post_id
      and public.posts.author_id = auth.uid()
  )
);

insert into public.post_images (post_id, image_url, image_path, sort_order)
select public.posts.id, public.posts.image_url, public.posts.image_path, 0
from public.posts
where public.posts.image_url is not null
  and public.posts.image_path is not null
  and not exists (
    select 1
    from public.post_images
    where public.post_images.post_id = public.posts.id
  );
