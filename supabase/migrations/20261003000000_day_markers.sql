-- Reporting day markers (holiday / leave / half day / note), shared by the team.
-- Previously stored only in each browser's localStorage.
create table if not exists public.day_markers (
  date       date primary key,
  type       text not null check (type in ('holiday','leave','halfday','note')),
  note       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Live updates so everyone sees markers change without refreshing
alter publication supabase_realtime add table public.day_markers;

alter table public.day_markers enable row level security;

create policy "Signed-in users can read day markers"
  on public.day_markers for select to authenticated using (true);
create policy "Signed-in users can add day markers"
  on public.day_markers for insert to authenticated with check (true);
create policy "Signed-in users can edit day markers"
  on public.day_markers for update to authenticated using (true) with check (true);
create policy "Signed-in users can remove day markers"
  on public.day_markers for delete to authenticated using (true);
