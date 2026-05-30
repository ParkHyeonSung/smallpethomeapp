create table if not exists public.stress_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  species text not null check (char_length(species) between 1 and 60),
  cage_width_cm numeric,
  cage_depth_cm numeric,
  ambient_noise_db integer not null check (ambient_noise_db between 0 and 140),
  vibration_level integer not null check (vibration_level between 0 and 10),
  traffic_level text not null check (traffic_level in ('low', 'medium', 'high')),
  checklist jsonb not null default '{}'::jsonb,
  score integer not null check (score between 0 and 100),
  level text not null check (level in ('stable', 'caution', 'warning')),
  noise_band_label text not null,
  summary text not null,
  highlights jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  measurement_notice text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists stress_reports_user_created_at_idx
on public.stress_reports (user_id, created_at desc);

alter table public.stress_reports enable row level security;

drop policy if exists "Users can read their own stress reports" on public.stress_reports;
create policy "Users can read their own stress reports"
on public.stress_reports
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own stress reports" on public.stress_reports;
create policy "Users can insert their own stress reports"
on public.stress_reports
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own stress reports" on public.stress_reports;
create policy "Users can delete their own stress reports"
on public.stress_reports
for delete
to authenticated
using (auth.uid() = user_id);
