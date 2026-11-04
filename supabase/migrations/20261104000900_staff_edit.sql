-- Editing staff (decision #18): names can be corrected, and the log records
-- the old and new name. Like roles and access, the Principal's and Attorneys'
-- details are changed by the principal only.

create or replace function public.profiles_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  perform public.log_event(
    case when tg_op = 'INSERT' then 'user.created' else 'user.updated' end,
    'profile',
    new.id::text,
    null,
    jsonb_build_object(
      'role', new.role,
      'active', new.active,
      'display_name', new.display_name,
      'old_role', case when tg_op = 'UPDATE' then old.role end,
      'old_active', case when tg_op = 'UPDATE' then old.active end,
      'old_display_name', case when tg_op = 'UPDATE' then old.display_name end
    )
  );
  return new;
end;
$$;

create or replace function public.profiles_guard()
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
  if v_me is distinct from 'principal' and (
       (old.role in ('principal', 'attorney')
        and (new.role is distinct from old.role or new.active is distinct from old.active
             or new.display_name is distinct from old.display_name))
       or (new.role in ('principal', 'attorney') and new.role is distinct from old.role)) then
    raise exception 'Only the principal can change the Principal or an Attorney, or give those roles'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
