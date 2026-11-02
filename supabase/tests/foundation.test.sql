-- Foundation tests: roles, MFA, append-only event log, settings.
-- Synthetic users only. Run inside a transaction and roll back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/foundation.test.sql
-- Every check raises an exception on failure, so the run stops at the first problem.

begin;

-- ---------------------------------------------------------------------------
-- Setup (as the database owner, like the server's service role would)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- principal
  ('00000000-0000-0000-0000-00000000000b'),  -- paralegal
  ('00000000-0000-0000-0000-00000000000c');  -- deactivated docketing

insert into public.profiles (id, display_name, role, active) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal', true),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal', true),
  ('00000000-0000-0000-0000-00000000000c', 'Test Docketing', 'docketing', false);

do $$ begin
  assert (select count(*) from public.event_log where event_type = 'user.created') = 3,
    'creating a profile must log user.created';
  assert (select count(*) from public.event_log where event_type = 'user.created' and actor_id is null) = 3,
    'server-created profiles are logged as system events';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Password only (aal1): no access until MFA is done
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "aal": "aal1"}';

do $$ begin
  assert public.current_app_role() is null, 'aal1 session must have no role';
  assert (select count(*) from public.profiles) = 0, 'aal1 session must not see profiles';
  assert (select count(*) from public.settings) = 0, 'aal1 session must not see settings';
  assert (select count(*) from public.event_log) = 0, 'aal1 session must not see the event log';
end $$;

do $$ begin
  perform public.log_event('test.event', 'test');
  raise exception 'aal1 session must not be able to log events';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Principal with MFA (aal2)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "aal": "aal2"}';

do $$ begin
  assert public.current_app_role() = 'principal', 'principal role expected';
  assert (select count(*) from public.profiles) = 3, 'principal sees all staff';
  assert (select count(*) from public.settings) = 8, 'principal sees all settings';
end $$;

update public.settings set value = '10' where key = 'retention.years_after_close';

do $$
declare e record;
begin
  assert (select value from public.settings where key = 'retention.years_after_close') = '10'::jsonb,
    'principal can change a setting';
  assert (select updated_by from public.settings where key = 'retention.years_after_close')
    = '00000000-0000-0000-0000-00000000000a', 'updated_by is set from the session';

  select * into e from public.event_log where event_type = 'setting.changed' order by id desc limit 1;
  assert e.actor_id = '00000000-0000-0000-0000-00000000000a', 'setting change logged with the principal as actor';
  assert e.actor_role = 'principal', 'actor role is recorded';
  assert e.entity_id = 'retention.years_after_close', 'setting key is recorded';
  assert e.payload = '{"old_value": 7, "new_value": 10}'::jsonb, 'old and new value are recorded';
end $$;

-- The principal can only change the value, not who changed it or the key list.
do $$ begin
  update public.settings set updated_by = null where key = 'client_auto_updates';
  raise exception 'updated_by must not be writable';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into public.settings (key, value, description) values ('new.key', '1', 'x');
  raise exception 'users must not add setting keys';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  delete from public.settings where key = 'client_auto_updates';
  raise exception 'users must not delete settings';
exception when insufficient_privilege then null;
end $$;

-- Principal changes a staff role: allowed and logged.
update public.profiles set role = 'docketing'
  where id = '00000000-0000-0000-0000-00000000000b';

do $$
declare e record;
begin
  select * into e from public.event_log where event_type = 'user.updated' order by id desc limit 1;
  assert e.entity_id = '00000000-0000-0000-0000-00000000000b', 'role change logged for the right user';
  assert e.payload ->> 'old_role' = 'paralegal' and e.payload ->> 'role' = 'docketing',
    'old and new role are recorded';
  assert e.actor_id = '00000000-0000-0000-0000-00000000000a', 'role change logged with the principal as actor';
end $$;

update public.profiles set role = 'paralegal'
  where id = '00000000-0000-0000-0000-00000000000b';

-- ---------------------------------------------------------------------------
-- 3. Paralegal with MFA: can read, cannot change settings or roles
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "aal": "aal2"}';

do $$ begin
  assert public.current_app_role() = 'paralegal', 'paralegal role expected';
  assert (select count(*) from public.settings) = 8, 'paralegal can read settings';
end $$;

update public.settings set value = 'true' where key = 'client_auto_updates';
update public.profiles set role = 'principal' where id = '00000000-0000-0000-0000-00000000000b';

do $$ begin
  assert (select value from public.settings where key = 'client_auto_updates') = 'false'::jsonb,
    'paralegal must not change settings';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'paralegal',
    'paralegal must not promote themselves';
end $$;

-- Events are written through log_event() only, in the caller's own name.
do $$
declare v_id bigint; e record;
begin
  v_id := public.log_event('test.event', 'test', 'x1', null, '{"note": "synthetic"}');
  select * into e from public.event_log where id = v_id;
  assert e.actor_id = '00000000-0000-0000-0000-00000000000b', 'actor comes from the session';
  assert e.actor_role = 'paralegal', 'actor role comes from the profile';
end $$;

do $$ begin
  insert into public.event_log (actor_id, event_type, entity_type)
    values ('00000000-0000-0000-0000-00000000000a', 'test.forged', 'test');
  raise exception 'direct insert into event_log must be blocked';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform public.log_event('Bad Event', 'test');
  raise exception 'malformed event types must be rejected';
exception when check_violation then null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Deactivated user with MFA: no access
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000c", "aal": "aal2"}';

do $$ begin
  assert public.current_app_role() is null, 'deactivated user must have no role';
  assert (select count(*) from public.event_log) = 0, 'deactivated user must not see the event log';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Not signed in (anon): no access at all
-- ---------------------------------------------------------------------------
reset request.jwt.claims;
set local role anon;

do $$ begin
  perform 1 from public.settings;
  raise exception 'anon must not read settings';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform 1 from public.event_log;
  raise exception 'anon must not read the event log';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The event log is append-only, even for the database owner
-- ---------------------------------------------------------------------------
reset role;

do $$ begin
  update public.event_log set event_type = 'test.changed';
  raise exception 'event_log update must be blocked';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  delete from public.event_log;
  raise exception 'event_log delete must be blocked';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  truncate public.event_log;
  raise exception 'event_log truncate must be blocked';
exception when insufficient_privilege then null;
end $$;

select 'ALL FOUNDATION TESTS PASSED' as result;

rollback;
