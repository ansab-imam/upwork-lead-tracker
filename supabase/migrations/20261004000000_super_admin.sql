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
