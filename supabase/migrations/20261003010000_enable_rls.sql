-- Lock down every table: nothing is readable or writable without signing in.
-- Transactions and reading the activity log are admin-only.
-- Only access rules change here; no rows are modified.
begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Team data: any signed-in user can read and edit
do $$
declare t text;
begin
  foreach t in array array[
    'canvases','la_columns','la_rows','lead_priority_records','notes',
    'proposal_columns','proposal_rows','tasks','team_members','todos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Signed-in users have full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Transactions: admins only
alter table public.tx_rows    enable row level security;
alter table public.tx_columns enable row level security;
create policy "Admins have full access" on public.tx_rows    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins have full access" on public.tx_columns for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Activity log: everyone's actions are recorded, only admins can read it
alter table public.activity_log enable row level security;
create policy "Signed-in users can record activity" on public.activity_log for insert to authenticated with check (true);
create policy "Admins can read activity"           on public.activity_log for select to authenticated using (public.is_admin());

-- User profiles: visible to the team, only admins can change them.
-- A user may create their own missing profile, but only as a normal user.
alter table public.user_profiles enable row level security;
create policy "Signed-in users can view profiles" on public.user_profiles for select to authenticated using (true);
create policy "Users can create own basic profile" on public.user_profiles for insert to authenticated
  with check (id = auth.uid() and role = 'user');
create policy "Admins can update profiles" on public.user_profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete profiles" on public.user_profiles for delete to authenticated
  using (public.is_admin());

commit;
