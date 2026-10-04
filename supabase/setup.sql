-- ════════════════════════════════════════════════════════════════════════════
-- Lead Tracker — complete database setup for a NEW Supabase project.
--
-- How to use: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. Safe to run more than once; it never deletes data.
--
-- Creates every table, security rule (row level security), the backup /
-- restore / start-fresh tools and live updates. The first person to sign in
-- to a brand-new install automatically becomes an admin.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null,
  role       text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.proposal_columns (
  id         text primary key,
  name       text not null,
  type       text not null,
  width      integer not null default 160,
  "order"    integer not null default 0,
  options    jsonb,
  created_at timestamptz default now()
);

create table if not exists public.proposal_rows (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  display_id text
);

create table if not exists public.la_columns (
  id            text primary key,
  name          text not null,
  source        text not null default 'local',
  linked_col_id text,
  type          text not null default 'text',
  options       jsonb,
  width         integer not null default 180,
  "order"       integer not null default 0
);

create table if not exists public.la_rows (
  id         serial primary key,
  unique_id  text not null unique,
  local_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.lead_priority_records (
  id                text primary key,
  unique_id         text not null,
  selected_criteria jsonb not null default '[]'::jsonb,
  score             integer not null default 0,
  tier              text not null default 'Low Tier',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists public.tx_columns (
  id      text primary key,
  name    text not null,
  type    text not null default 'text',
  width   integer not null default 160,
  "order" integer not null default 0,
  options jsonb
);

create table if not exists public.tx_rows (
  id         text primary key,
  display_id text,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.tasks (
  id              text primary key,
  task_id         text not null,
  title           text not null,
  description     text default '',
  created_by      text default '',
  assignees       jsonb default '[]'::jsonb,
  urgency         text not null default 'medium',
  status          text not null default 'not_started',
  start_date      text,
  deadline        text,
  completion_date text,
  category        text,
  notes           text default '',
  comments        jsonb default '[]'::jsonb,
  history         jsonb default '[]'::jsonb,
  progress        integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  tracking        jsonb default '[]'::jsonb,
  attachments     jsonb default '[]'::jsonb,
  subtasks        jsonb default '[]'::jsonb
);

create table if not exists public.team_members (
  id         text primary key,
  name       text not null,
  email      text,
  created_at timestamptz default now()
);

create table if not exists public.todos (
  id         text primary key,
  text       text not null default '',
  completed  boolean not null default false,
  priority   text not null default 'medium',
  due_date   text,
  created_at timestamptz default now()
);

create table if not exists public.notes (
  id         text primary key,
  title      text not null default '',
  content    text not null default '',
  color      text not null default 'white',
  pinned     boolean not null default false,
  tags       jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.canvases (
  id         text primary key,
  name       text not null default 'Untitled Canvas',
  shapes     jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.day_markers (
  date       date primary key,
  type       text not null check (type in ('holiday','leave','halfday','note')),
  note       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.activity_log (
  id         text primary key,
  user_id    uuid not null,
  user_name  text not null,
  user_email text not null,
  action     text not null,
  module     text not null,
  target     text default '',
  detail     text not null,
  created_at timestamptz default now()
);

-- ── Admin helpers ───────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.has_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles where role = 'admin');
$$;

-- First person to sign in to a brand-new install becomes admin
create or replace function public.first_user_becomes_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_any_admin() then
    new.role := 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists first_user_becomes_admin on public.user_profiles;
create trigger first_user_becomes_admin
  before insert on public.user_profiles
  for each row execute function public.first_user_becomes_admin();

revoke all on function public.is_admin(), public.has_any_admin() from public, anon;
grant execute on function public.is_admin(), public.has_any_admin() to authenticated;

-- ── Security rules (row level security) ─────────────────────────────────────

do $$
declare t text;
begin
  -- Team data: any signed-in user can read and edit
  foreach t in array array[
    'canvases','la_columns','la_rows','lead_priority_records','notes',
    'proposal_columns','proposal_rows','tasks','team_members','todos','day_markers'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Signed-in users have full access" on public.%I', t);
    execute format('create policy "Signed-in users have full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;

  -- Transactions: admins only
  foreach t in array array['tx_rows','tx_columns'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Admins have full access" on public.%I', t);
    execute format('create policy "Admins have full access" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

alter table public.activity_log enable row level security;
drop policy if exists "Signed-in users can record activity" on public.activity_log;
drop policy if exists "Admins can read activity" on public.activity_log;
create policy "Signed-in users can record activity" on public.activity_log for insert to authenticated with check (true);
create policy "Admins can read activity"           on public.activity_log for select to authenticated using (public.is_admin());

alter table public.user_profiles enable row level security;
drop policy if exists "Signed-in users can view profiles"  on public.user_profiles;
drop policy if exists "Users can create own basic profile" on public.user_profiles;
drop policy if exists "Admins can update profiles"         on public.user_profiles;
drop policy if exists "Admins can delete profiles"         on public.user_profiles;
create policy "Signed-in users can view profiles" on public.user_profiles for select to authenticated using (true);
create policy "Users can create own basic profile" on public.user_profiles for insert to authenticated
  with check (id = auth.uid() and (role = 'user' or not public.has_any_admin()));
create policy "Admins can update profiles" on public.user_profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete profiles" on public.user_profiles for delete to authenticated
  using (public.is_admin());

-- ── Live updates ────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'proposal_columns','proposal_rows','la_columns','la_rows','lead_priority_records',
    'tx_columns','tx_rows','notes','todos','tasks','team_members','activity_log','day_markers'
  ] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Backup, restore and start fresh ─────────────────────────────────────────

create or replace function public.backup_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'proposal_columns','proposal_rows',
    'la_columns','la_rows',
    'lead_priority_records',
    'tx_columns','tx_rows',
    'tasks','team_members','todos',
    'notes','canvases','day_markers',
    'activity_log','user_profiles'
  ];
$$;

create or replace function public.export_backup()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t      text;
  rows   jsonb;
  tables jsonb := '{}'::jsonb;
  counts jsonb := '{}'::jsonb;
  me     record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can download backups';
  end if;

  foreach t in array public.backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into rows;
    tables := tables || jsonb_build_object(t, rows);
    counts := counts || jsonb_build_object(t, jsonb_array_length(rows));
  end loop;

  select id, email, full_name into me from public.user_profiles where id = auth.uid();

  insert into public.activity_log (id, user_id, user_name, user_email, action, module, target, detail)
  values (gen_random_uuid()::text, me.id, me.full_name, me.email, 'exported', 'Backup', 'All data',
          'Downloaded a full backup');

  return jsonb_build_object(
    'format',     'leadtracker-backup',
    'version',    1,
    'created_at', now(),
    'created_by', me.email,
    'counts',     counts,
    'tables',     tables
  );
end;
$$;

create or replace function public.restore_backup(backup jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t           text;
  arr         jsonb;
  missing_n   bigint;
  extra_n     bigint;
  result      jsonb := '{}'::jsonb;
  me          record;
  kept_users  bigint;
  skipped_users bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can import backups';
  end if;

  -- 1. Check the file before touching anything
  if backup is null or backup->>'format' is distinct from 'leadtracker-backup' then
    raise exception 'This file is not a Lead Tracker backup';
  end if;
  if (backup->>'version')::int is distinct from 1 then
    raise exception 'This backup was made by a different version of Lead Tracker (version %)', backup->>'version';
  end if;
  foreach t in array public.backup_tables() loop
    if jsonb_typeof(backup->'tables'->t) is distinct from 'array' then
      raise exception 'The backup file is incomplete: "%" is missing', t;
    end if;
    if backup->'counts' ? t and (backup->'counts'->>t)::int <> jsonb_array_length(backup->'tables'->t) then
      raise exception 'The backup file looks damaged: "%" should have % rows but has %',
        t, backup->'counts'->>t, jsonb_array_length(backup->'tables'->t);
    end if;
  end loop;

  select id, email, full_name, role into me from public.user_profiles where id = auth.uid();

  -- 2. Replace every regular table with the backup's rows
  foreach t in array public.backup_tables() loop
    continue when t = 'user_profiles';
    arr := backup->'tables'->t;

    if t = 'day_markers' then
      -- updated_by must point at an existing login
      select coalesce(jsonb_agg(
               case when exists (select 1 from auth.users u where u.id::text = e->>'updated_by')
                    then e else jsonb_set(e, '{updated_by}', 'null'::jsonb) end), '[]'::jsonb)
        into arr from jsonb_array_elements(arr) e;
    end if;

    execute format('delete from public.%I where true', t);  -- 'where true': newer Supabase projects reject DELETE without WHERE
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t) using arr;

    -- 3. Verify: table contents must equal the backup exactly
    execute format($q$
      select
        (select count(*) from (select to_jsonb(r) from jsonb_populate_recordset(null::public.%1$I, $1) r
                               except all select to_jsonb(x) from public.%1$I x) a),
        (select count(*) from (select to_jsonb(x) from public.%1$I x
                               except all select to_jsonb(r) from jsonb_populate_recordset(null::public.%1$I, $1) r) b)
    $q$, t) using arr into missing_n, extra_n;

    if missing_n <> 0 or extra_n <> 0 then
      raise exception 'Restore check failed for "%": % rows missing, % unexpected. Nothing was changed.', t, missing_n, extra_n;
    end if;

    result := result || jsonb_build_object(t, jsonb_array_length(arr));
  end loop;

  -- la_rows uses an auto-number; make sure new rows continue after the restored ones
  perform setval(pg_get_serial_sequence('public.la_rows', 'id'),
                 greatest(coalesce((select max(id) from public.la_rows), 0), 1),
                 (select count(*) > 0 from public.la_rows));

  -- 4. User profiles: restore names/roles for logins that still exist, never delete
  -- roles are only applied when a super admin restores (see super_admin migration)
  perform public.restore_user_profiles(backup->'tables'->'user_profiles');

  select count(*) into skipped_users
    from jsonb_array_elements(backup->'tables'->'user_profiles') e
   where not exists (select 1 from auth.users u where u.id::text = e->>'id');
  select count(*) into kept_users
    from public.user_profiles p
   where not exists (select 1 from jsonb_array_elements(backup->'tables'->'user_profiles') e where e->>'id' = p.id::text);

  result := result || jsonb_build_object('user_profiles', jsonb_array_length(backup->'tables'->'user_profiles') - skipped_users);

  -- Record the restore (after verification, so it doesn't affect the check)
  insert into public.activity_log (id, user_id, user_name, user_email, action, module, target, detail)
  values (gen_random_uuid()::text, me.id, me.full_name, me.email, 'restored', 'Backup', 'All data',
          format('Restored backup from %s', coalesce(backup->>'created_at', 'unknown date')));

  return jsonb_build_object(
    'restored',            result,
    'users_kept',          kept_users,
    'users_skipped',       skipped_users,
    'backup_created_at',   backup->>'created_at'
  );
end;
$$;

revoke all on function public.export_backup()        from public, anon;
revoke all on function public.restore_backup(jsonb)  from public, anon;
grant execute on function public.export_backup()       to authenticated;
grant execute on function public.restore_backup(jsonb) to authenticated;

create or replace function public.clear_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'proposal_rows','la_rows','lead_priority_records','tx_rows',
    'tasks','team_members','todos','notes','canvases','day_markers',
    'activity_log'
  ];
$$;

create or replace function public.clear_all_data(confirm text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t       text;
  n       bigint;
  left_n  bigint;
  removed jsonb := '{}'::jsonb;
  me      record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can clear data';
  end if;
  if confirm is distinct from 'DELETE ALL DATA' then
    raise exception 'Confirmation text did not match. Nothing was deleted.';
  end if;

  foreach t in array public.clear_tables() loop
    execute format('with d as (delete from public.%I where true returning 1) select count(*) from d', t) into n;
    removed := removed || jsonb_build_object(t, n);
  end loop;

  -- Verify every module is empty before committing
  foreach t in array public.clear_tables() loop
    execute format('select count(*) from public.%I', t) into left_n;
    if left_n <> 0 then
      raise exception 'Clear check failed: "%" still has % rows. Nothing was deleted.', t, left_n;
    end if;
  end loop;

  -- New Lead Analysis rows start numbering from 1 again
  perform setval(pg_get_serial_sequence('public.la_rows', 'id'), 1, false);

  select id, email, full_name into me from public.user_profiles where id = auth.uid();
  insert into public.activity_log (id, user_id, user_name, user_email, action, module, target, detail)
  values (gen_random_uuid()::text, me.id, me.full_name, me.email, 'cleared', 'Backup', 'All data',
          'Cleared all data to start fresh');

  return jsonb_build_object('removed', removed);
end;
$$;

revoke all on function public.clear_all_data(text) from public, anon;
grant execute on function public.clear_all_data(text) to authenticated;

-- ── Super admin ─────────────────────────────────────────────────────────────
-- (same as supabase/migrations/20261004000000_super_admin.sql)

-- Super admins: admins who also manage other admins.
--   - Only a super admin can create, promote, demote, edit or remove admin
--     accounts. Admins keep full app access and can still manage users.
--   - There is always at least one super admin.
--   - The original admin on each install becomes super admin automatically.
-- Enforced by triggers, so it holds no matter how the table is changed.
-- Safe to run more than once.

alter table public.user_profiles add column if not exists super_admin boolean not null default false;

do $$ begin
  alter table public.user_profiles add constraint user_profiles_super_admin_is_admin
    check (not super_admin or role = 'admin');
exception when duplicate_object then null; end $$;

-- Existing installs: the earliest admin becomes super admin
update public.user_profiles set super_admin = true
 where id = (select id from public.user_profiles where role = 'admin' order by created_at, id limit 1)
   and not exists (select 1 from public.user_profiles where super_admin);

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin' and super_admin);
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- First profile on a brand-new install becomes super admin
create or replace function public.first_user_becomes_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_any_admin() then
    new.role := 'admin';
    new.super_admin := true;
  end if;
  return new;
end;
$$;

-- Who may change whom. auth.uid() is null for server-side code (the
-- admin-users helper, SQL editor), which does its own checks.
create or replace function public.guard_user_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_is_super boolean := public.is_super_admin();
begin
  if caller_is_super then
    return coalesce(new, old);
  end if;

  if caller is null then
    -- Server-side code. The admin-users helper records who created a
    -- profile, so admin accounts it creates still need a super admin behind them.
    if tg_op = 'INSERT' and new.role = 'admin' and new.created_by is not null
       and public.has_any_admin()
       and not exists (select 1 from public.user_profiles
                        where id = new.created_by and role = 'admin' and super_admin) then
      raise exception 'Only a super admin can create admins.';
    end if;
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- New profiles from non-super callers can't be super admins
    -- (the very first profile is promoted by first_user_becomes_admin)
    if new.super_admin and public.has_any_admin() then
      raise exception 'Only a super admin can create a super admin.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'admin' then
      raise exception 'Only a super admin can remove admins.';
    end if;
    return old;
  end if;

  -- UPDATE: anyone may change their own name; otherwise admins may only
  -- edit normal users and may not promote anyone
  if new.role is distinct from old.role or new.super_admin is distinct from old.super_admin then
    if new.role = 'admin' or old.role = 'admin' then
      raise exception 'Only a super admin can change admin roles.';
    end if;
  end if;
  if old.role = 'admin' and old.id <> caller then
    raise exception 'Only a super admin can change admin accounts.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_profile_changes on public.user_profiles;
create trigger guard_user_profile_changes
  before insert or update or delete on public.user_profiles
  for each row execute function public.guard_user_profile_changes();

-- Never leave an install without a super admin
create or replace function public.keep_a_super_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.user_profiles)
     and not exists (select 1 from public.user_profiles where role = 'admin' and super_admin) then
    raise exception 'There must always be at least one super admin.';
  end if;
  return null;
end;
$$;

drop trigger if exists keep_a_super_admin on public.user_profiles;
create trigger keep_a_super_admin
  after update or delete on public.user_profiles
  for each statement execute function public.keep_a_super_admin();

-- Restore: roles in a backup are applied only when a super admin restores;
-- the person restoring always stays super admin.
create or replace function public.restore_user_profiles(profiles jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  is_super boolean := public.is_super_admin();
begin
  insert into public.user_profiles (id, email, full_name, role, super_admin, created_at, created_by)
  select r.id, r.email, r.full_name, r.role, coalesce(r.super_admin, false) and r.role = 'admin', r.created_at,
         case when exists (select 1 from auth.users u where u.id = r.created_by) then r.created_by end
    from jsonb_populate_recordset(null::public.user_profiles, profiles) r
   where exists (select 1 from auth.users u where u.id = r.id)
     and (is_super or not exists (select 1 from public.user_profiles p where p.id = r.id and p.role = 'admin'))
     and (is_super or r.role = 'user')
  on conflict (id) do update
     set email       = excluded.email,
         full_name   = excluded.full_name,
         role        = case when public.user_profiles.id = auth.uid() then 'admin'
                            when is_super then excluded.role else public.user_profiles.role end,
         super_admin = case when public.user_profiles.id = auth.uid() then public.user_profiles.super_admin
                            when is_super then excluded.super_admin else public.user_profiles.super_admin end,
         created_at  = excluded.created_at,
         created_by  = excluded.created_by;
end;
$$;
revoke all on function public.restore_user_profiles(jsonb) from public, anon, authenticated;

-- Starter columns for Proposal Details on a brand-new database. Skipped if any
-- columns already exist, so re-running this file never touches your layout.
insert into public.proposal_columns (id, name, type, width, "order", options)
select * from (values
  ('col_client',  'Client Name',     'text',     170, 0, null::jsonb),
  ('col_job',     'Job Title',       'text',     240, 1, null),
  ('col_profile', 'Profile',         'text',     150, 2, null),
  ('col_sdr',     'SDR',             'text',     140, 3, null),
  ('col_budget',  'Budget ($)',      'number',   120, 4, null),
  ('col_date',    'Proposal Date',   'date',     140, 5, null),
  ('col_status',  'Proposal Status', 'dropdown', 150, 6, '[
     {"id":"opt_submitted","label":"Submitted","color":"slate"},
     {"id":"opt_viewed","label":"Viewed","color":"blue"},
     {"id":"opt_contacted","label":"Contacted","color":"yellow"},
     {"id":"opt_interviewed","label":"Interviewed","color":"orange"},
     {"id":"opt_hired","label":"Hired","color":"green"}
   ]'::jsonb)
) as v(id, name, type, width, "order", options)
where not exists (select 1 from public.proposal_columns);
