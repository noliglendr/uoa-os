-- What the Administrator may do (decision #16):
-- * manage staff and firm settings, like the principal;
-- * never approve, verify, close or decline: those checks stay limited to the
--   attorney and the principal (is_attorney_or_system), so nothing changes there;
-- * never give, change or remove the Principal or Attorney role: only the
--   principal can.
-- Nobody can change their own role or switch off their own access.

alter policy profiles_update_principal on public.profiles
  using ((select public.has_role(array['principal', 'administrator']::public.app_role[])))
  with check ((select public.has_role(array['principal', 'administrator']::public.app_role[])));

alter policy settings_update_principal on public.settings
  using ((select public.has_role(array['principal', 'administrator']::public.app_role[])))
  with check ((select public.has_role(array['principal', 'administrator']::public.app_role[])));

create function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.app_role := public.current_app_role();
begin
  -- System sessions (seed, service role, SQL editor) have no signed-in user.
  if auth.uid() is null then
    return new;
  end if;
  if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You can''t change your own role or switch off your own access'
      using errcode = 'insufficient_privilege';
  end if;
  if v_me is distinct from 'principal'
     and (new.role is distinct from old.role or new.active is distinct from old.active)
     and (old.role in ('principal', 'attorney') or new.role in ('principal', 'attorney')) then
    raise exception 'Only the principal can give, change or remove the Principal or Attorney role'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- The Staff screen: the administrator also sees emails and two-step status.
create or replace function public.staff_page()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.current_app_role() is null then '[]'::jsonb else coalesce((
    select jsonb_agg(
             jsonb_build_object('id', p.id, 'display_name', p.display_name, 'role', p.role, 'active', p.active, 'created_at', p.created_at)
             || case when public.has_role(array['principal', 'administrator']::public.app_role[]) then jsonb_build_object(
                  'email', u.email,
                  'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
                  'last_sign_in_at', u.last_sign_in_at)
                else '{}'::jsonb end
             order by p.created_at)
    from public.profiles p
    left join auth.users u on u.id = p.id), '[]'::jsonb) end;
$$;
