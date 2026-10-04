-- Admin-only full backup (export) and exact-copy restore (import).
--
-- export_backup()        -> one JSON document with every table, taken as a single snapshot
-- restore_backup(backup) -> makes the database match the backup, in ONE transaction:
--                           either everything is restored and verified, or nothing changes.
--
-- User accounts are special: logins (and their passwords) live in Supabase Auth and
-- cannot be exported, so profiles are restored for logins that still exist, but no
-- profile is ever deleted and the admin running the restore can't lose admin rights.

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
