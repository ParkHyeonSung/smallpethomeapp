create table if not exists public.cage_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  animal_species text check (animal_species is null or char_length(animal_species) between 1 and 60),
  cage_width_cm numeric not null check (cage_width_cm > 0 and cage_width_cm <= 500),
  cage_depth_cm numeric not null check (cage_depth_cm > 0 and cage_depth_cm <= 500),
  cage_height_cm numeric not null check (cage_height_cm > 0 and cage_height_cm <= 300),
  objects jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cage_simulations_objects_is_array check (jsonb_typeof(objects) = 'array')
);

create index if not exists cage_simulations_user_created_at_idx
on public.cage_simulations (user_id, created_at desc);

create index if not exists cage_simulations_public_created_at_idx
on public.cage_simulations (is_public, created_at desc);

drop trigger if exists set_cage_simulations_updated_at on public.cage_simulations;
create trigger set_cage_simulations_updated_at
before update on public.cage_simulations
for each row
execute function public.set_updated_at();

alter table public.cage_simulations enable row level security;

drop policy if exists "Users can read public cage simulations and their own cage simulations" on public.cage_simulations;
create policy "Users can read public cage simulations and their own cage simulations"
on public.cage_simulations
for select
to authenticated
using (is_public = true or auth.uid() = user_id);

drop policy if exists "Users can insert their own cage simulations" on public.cage_simulations;
create policy "Users can insert their own cage simulations"
on public.cage_simulations
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own cage simulations" on public.cage_simulations;
create policy "Users can update their own cage simulations"
on public.cage_simulations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own cage simulations" on public.cage_simulations;
create policy "Users can delete their own cage simulations"
on public.cage_simulations
for delete
to authenticated
using (auth.uid() = user_id);
