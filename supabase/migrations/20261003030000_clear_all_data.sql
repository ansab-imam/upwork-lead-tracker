-- Admin-only "Start fresh": removes every entry from every module in ONE transaction.
-- Kept: column setups (proposal_columns, la_columns, tx_columns) and user profiles/logins.
-- Afterwards a single activity log entry records who cleared the data and when.

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
