-- Removing staff (decision #19). Only accounts with no activity can be removed:
-- anyone who appears in the history, approved, logged, verified or completed
-- anything, or is someone's attorney of record, must stay so the records are
-- complete; for them, access is switched off instead. The database enforces
-- this through its foreign keys: deleting a referenced profile fails.
-- Same limits as editing: principal or administrator, not yourself, and the
-- Principal or Attorneys only by the principal. The removal itself is logged.

create function public.remove_staff(p_profile uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.app_role := public.current_app_role();
  v_person public.profiles;
begin
  if v_me is null or v_me not in ('principal', 'administrator') then
    raise exception 'Only the principal or an administrator can remove staff' using errcode = 'insufficient_privilege';
  end if;
  if p_profile = auth.uid() then
    raise exception 'You can''t remove yourself' using errcode = 'insufficient_privilege';
  end if;
  select * into v_person from public.profiles where id = p_profile;
  if not found then
    raise exception 'That person was not found' using errcode = 'no_data_found';
  end if;
  if v_person.role in ('principal', 'attorney') and v_me <> 'principal' then
    raise exception 'Only the principal can remove the Principal or an Attorney' using errcode = 'insufficient_privilege';
  end if;

  begin
    delete from public.profiles where id = p_profile;
  exception when foreign_key_violation then
    raise exception '% has activity in the records, so they can''t be removed. Switch off their access instead.', v_person.display_name
      using errcode = 'foreign_key_violation';
  end;

  perform public.log_event('user.removed', 'profile', p_profile::text, null,
    jsonb_build_object('display_name', v_person.display_name, 'role', v_person.role));
  return v_person.display_name;
end;
$$;

revoke execute on function public.remove_staff(uuid) from public, anon;
grant execute on function public.remove_staff(uuid) to authenticated;
