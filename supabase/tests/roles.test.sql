-- Role views (decision #17): what Intake can and can't do. Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/roles.test.sql

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

create function pg_temp.m() returns uuid language sql as $$ select id from public.matters where code = 'Matter I' $$;

grant execute on all functions in schema pg_temp to authenticated;

-- a = principal, e = intake, b = paralegal
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000e'), ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000e', 'Test Intake', 'intake'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal');

set local role authenticated;

-- Intake opens a matter, adds a party, clears the conflict and moves it to stage 2.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.matters (code, summary, matter_type) values ('Matter I', 'Synthetic intake test', 'petition');
insert into public.parties (matter_id, label, party_role) values (pg_temp.m(), 'Client 1', 'petitioner');
update public.parties set conflict_cleared = true where matter_id = pg_temp.m();
select public.advance_stage(pg_temp.m());
do $$ begin
  assert (select stage from public.matters where id = pg_temp.m()) = 2, 'intake moves a new matter from stage 1 to 2';
end $$;

-- Intake can't log notices, add deadlines, filings, checklist items or appearances.
select pg_temp.expect_error($$select public.log_notice(pg_temp.m(), null, 'receipt', 'mail', current_date, current_date)$$, '42501');
select pg_temp.expect_error($$insert into public.deadlines (matter_id, kind, title, due_date) values (pg_temp.m(), 'response', 'X', current_date + 9)$$, '42501');
select pg_temp.expect_error($$insert into public.filings (matter_id, form_type, forum) values (pg_temp.m(), 'I-130', 'uscis')$$, '42501');
select pg_temp.expect_error($$insert into public.checklist_items (matter_id, label, owner) values (pg_temp.m(), 'X', 'client')$$, '42501');

-- The attorney engages the matter; after stage 2, Intake can't change it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_gate(pg_temp.m(), 2::smallint);
select public.advance_stage(pg_temp.m());
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$update public.matters set summary = 'changed' where id = pg_temp.m()$$, '42501');

-- A paralegal still does all of it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.checklist_items (matter_id, label, owner) values (pg_temp.m(), 'Synthetic evidence', 'client');
do $$ begin
  assert jsonb_array_length(public.dashboard_data() -> 'evidence_open') = 1, 'dashboard lists evidence still to collect';
end $$;

reset role;
select 'ALL ROLE TESTS PASSED';
rollback;
