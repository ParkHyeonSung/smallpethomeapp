alter table public.post_product_tags
add column if not exists image_sort_order integer not null default 0
check (image_sort_order >= 0);

create index if not exists post_product_tags_post_id_image_sort_order_idx
on public.post_product_tags (post_id, image_sort_order asc);

notify pgrst, 'reload schema';
