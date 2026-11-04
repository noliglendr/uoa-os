-- Administrator role tests (decision #16). Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/admin.test.sql

begin;

create function pg_temp.expect_error(p_sql text, p_state text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state then
      raise exception 'expected % but got %: % (sql: %)', p_state, sqlstate, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'expected error % but it succeeded: %', p_state, p_sql;
end;
$$;

create function pg_temp.as_user(p_sub text)
returns void
language sql
as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'aal', 'aal2')::text, true);
$$;

grant execute on all functions in schema pg_temp to authenticated;

-- a = principal, d = administrator, b = paralegal, c = attorney
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal'),
  ('00000000-0000-0000-0000-00000000000c', 'Test Attorney', 'attorney'),
  ('00000000-0000-0000-0000-00000000000d', 'Test Administrator', 'administrator');

-- A synthetic matter waiting for the engagement approval (stage 2).
insert into public.matters (code, summary, matter_type, stage, status)
values ('Matter Z', 'Synthetic test matter', 'petition', 2, 'prospect');
insert into public.deadlines (matter_id, kind, title, due_date)
select id, 'response', 'Synthetic deadline', current_date + 30 from public.matters where code = 'Matter Z';

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');

-- The administrator manages settings ...
update public.settings set value = '15' where key = 'dashboard.stalled_days';
do $$ begin
  assert (select value from public.settings where key = 'dashboard.stalled_days') = '15'::jsonb, 'administrator changes a setting';
end $$;

-- ... and non-legal staff roles ...
update public.profiles set role = 'docketing' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'docketing', 'administrator changes a staff role';
end $$;

-- ... and sees emails and two-step status on the Staff screen.
do $$ begin
  assert (public.staff_page() -> 0) ? 'mfa', 'administrator sees two-step status';
end $$;

-- But never touches the principal or attorney roles, nor their own.
select pg_temp.expect_error($$update public.profiles set role = 'principal' where id = '00000000-0000-0000-0000-00000000000b'$$, '42501');
select pg_temp.expect_error($$update public.profiles set role = 'paralegal' where id = '00000000-0000-0000-0000-00000000000c'$$, '42501');
select pg_temp.expect_error($$update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000a'$$, '42501');
select pg_temp.expect_error($$update public.profiles set role = 'principal' where id = '00000000-0000-0000-0000-00000000000d'$$, '42501');

-- Names: the administrator corrects a paralegal's name, not the principal's or an attorney's.
update public.profiles set display_name = 'Test Docketing' where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Test Docketing', 'administrator corrects a name';
  assert exists (select 1 from public.event_log where event_type = 'user.updated' and payload ->> 'old_display_name' = 'Test Paralegal'),
    'the old name is logged';
end $$;
select pg_temp.expect_error($$update public.profiles set display_name = 'X' where id = '00000000-0000-0000-0000-00000000000a'$$, '42501');
select pg_temp.expect_error($$update public.profiles set display_name = 'X' where id = '00000000-0000-0000-0000-00000000000c'$$, '42501');

-- Removing staff: only accounts with no activity, and within the same limits.
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'Unused Intake', 'intake'),
  ('00000000-0000-0000-0000-0000000000f2', 'Busy Paralegal', 'paralegal');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
insert into public.matters (code, summary, matter_type) values ('Matter R', 'Synthetic removal test', 'petition');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.remove_staff('00000000-0000-0000-0000-0000000000f1');
do $$ begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'an unused account is removed';
  assert exists (select 1 from public.event_log where event_type = 'user.removed' and payload ->> 'display_name' = 'Unused Intake'), 'the removal is logged';
end $$;
select pg_temp.expect_error($$select public.remove_staff('00000000-0000-0000-0000-0000000000f2')$$, '23503');  -- has activity
select pg_temp.expect_error($$select public.remove_staff('00000000-0000-0000-0000-00000000000a')$$, '42501');  -- the principal
select pg_temp.expect_error($$select public.remove_staff('00000000-0000-0000-0000-00000000000d')$$, '42501');  -- yourself
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select public.remove_staff('00000000-0000-0000-0000-0000000000f2')$$, '42501');  -- an attorney can't
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');

-- And approves or verifies nothing.
select pg_temp.expect_error($$select public.approve_gate((select id from public.matters where code = 'Matter Z'), 2::smallint)$$, '42501');
select pg_temp.expect_error($$update public.deadlines set attorney_verified = true where title = 'Synthetic deadline'$$, '42501');
select pg_temp.expect_error($$update public.deadline_rules set attorney_verified = true where code = 'U1'$$, '42501');
select pg_temp.expect_error($$select public.decline_matter((select id from public.matters where code = 'Matter Z'), 'test')$$, '42501');

-- Staff who are not principal or administrator can't change staff or settings
-- (the update silently matches no row: RLS hides it).
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
update public.profiles set role = 'intake' where id = '00000000-0000-0000-0000-00000000000d';
update public.settings set value = '99' where key = 'dashboard.stalled_days';

-- Checked as the principal, who can read everything.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 'administrator',
    'an attorney can''t change staff roles';
  assert (select value from public.settings where key = 'dashboard.stalled_days') = '15'::jsonb,
    'an attorney can''t change settings';
end $$;

-- The principal can give the attorney role, and nobody can change their own.
update public.profiles set role = 'attorney', active = true where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'attorney', 'principal gives the attorney role';
end $$;
select pg_temp.expect_error($$update public.profiles set role = 'paralegal' where id = '00000000-0000-0000-0000-00000000000a'$$, '42501');

reset role;
select 'ALL ADMINISTRATOR TESTS PASSED';
rollback;
