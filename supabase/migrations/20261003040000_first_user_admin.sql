-- A brand-new install has no admins, so nobody could manage users or import a
-- backup. The first profile created becomes admin; after that, new profiles are
-- normal users (and can't promote themselves).

create or replace function public.has_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles where role = 'admin');
$$;
revoke all on function public.has_any_admin() from public, anon;
grant execute on function public.has_any_admin() to authenticated;

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

drop policy if exists "Users can create own basic profile" on public.user_profiles;
create policy "Users can create own basic profile" on public.user_profiles for insert to authenticated
  with check (id = auth.uid() and (role = 'user' or not public.has_any_admin()));
