-- Fixing mistakes (decision #20): Edit and "Entered in error". Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/corrections.test.sql

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

create function pg_temp.m() returns uuid language sql as $$ select id from public.matters where code = 'Matter E' $$;
create function pg_temp.party(p_label text) returns uuid language sql as $$
  select id from public.parties where matter_id = pg_temp.m() and label = p_label $$;

grant execute on all functions in schema pg_temp to authenticated;

-- a = principal, b = paralegal
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

insert into public.matters (code, summary, matter_type) values ('Matter E', 'Synthetic corrections test', 'petition');
insert into public.parties (matter_id, label, party_role) values
  (pg_temp.m(), 'Client 1', 'petitioner'),
  (pg_temp.m(), 'Client X', 'beneficiary');

-- Edit: listed fields only, and the change is logged with the old value.
select public.edit_record('parties', pg_temp.party('Client 1'), '{"label": "Client 1A", "party_role": "applicant"}');
do $$ begin
  assert (select party_role from public.parties where id = pg_temp.party('Client 1A')) = 'applicant', 'edit changes the fields';
  assert exists (select 1 from public.event_log e where e.event_type = 'party.updated'
                 and e.payload -> 'old' ->> 'label' = 'Client 1'), 'edit is logged with the old value';
end $$;
select pg_temp.expect_error($$select public.edit_record('parties', pg_temp.party('Client 1A'), '{"conflict_cleared": true}')$$, '23514');

-- Entered in error needs a reason; the marker can't be set directly.
select pg_temp.expect_error($$select public.mark_entered_in_error('parties', pg_temp.party('Client X'), '  ')$$, '23514');
select pg_temp.expect_error($$update public.parties set voided_at = now(), void_reason = 'x' where id = pg_temp.party('Client X')$$, '42501');

select public.mark_entered_in_error('parties', pg_temp.party('Client X'), 'Added by mistake');
do $$ begin
  assert (select voided_by from public.parties where id = pg_temp.party('Client X')) = '00000000-0000-0000-0000-00000000000b',
    'entered in error records who';
end $$;
-- The row stays, but is frozen, and leaves the exit check: only Client 1A needs clearing.
select pg_temp.expect_error($$update public.parties set label = 'Client Y' where id = pg_temp.party('Client X')$$, '23514');
select pg_temp.expect_error($$select public.mark_entered_in_error('parties', pg_temp.party('Client X'), 'again')$$, '23514');
update public.parties set conflict_cleared = true where id = pg_temp.party('Client 1A');
select public.advance_stage(pg_temp.m());
do $$ begin
  assert (select stage from public.matters where id = pg_temp.m()) = 2, 'a party entered in error does not block stage 1';
end $$;

-- A notice entered in error takes its deadline and tasks with it (no R1 error).
select public.log_notice(pg_temp.m(), null, 'rfe', 'mail', current_date, current_date);
select public.mark_entered_in_error('notices', (select id from public.notices where matter_id = pg_temp.m()), 'Logged on the wrong matter');
set constraints all immediate;
do $$ begin
  assert not exists (select 1 from public.deadlines where matter_id = pg_temp.m() and status = 'open'), 'its deadline is cancelled';
  assert not exists (select 1 from public.deadlines where matter_id = pg_temp.m() and voided_at is null), 'its deadline is marked too';
  assert not exists (select 1 from public.tasks where matter_id = pg_temp.m() and status = 'open'), 'its tasks are cancelled';
end $$;
set constraints all deferred;

-- Deadlines: only the attorney marks one as entered in error; a new date clears verification.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.deadlines (matter_id, kind, title, due_date, attorney_verified)
values (pg_temp.m(), 'response', 'Synthetic deadline', current_date + 30, true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.mark_entered_in_error('deadlines',
  (select id from public.deadlines where title = 'Synthetic deadline'), 'Wrong')$$, '42501');
select public.edit_record('deadlines', (select id from public.deadlines where title = 'Synthetic deadline'),
  jsonb_build_object('due_date', current_date + 31));
do $$ begin
  assert not (select attorney_verified from public.deadlines where title = 'Synthetic deadline'), 'a new date needs the attorney again';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.mark_entered_in_error('deadlines', (select id from public.deadlines where title = 'Synthetic deadline'), 'Duplicate');
do $$ begin
  assert (select status from public.deadlines where title = 'Synthetic deadline') = 'cancelled', 'deadline entered in error is cancelled';
end $$;

-- Filings: one entered in error leaves the dashboard and the checks; a filing with notices can't be.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.filings (matter_id, form_type, forum) values (pg_temp.m(), 'I-130', 'uscis'), (pg_temp.m(), 'I-140', 'uscis');
select public.log_notice(pg_temp.m(), (select id from public.filings where matter_id = pg_temp.m() and form_type = 'I-140'),
  'rfe', 'mail', current_date, current_date);
select pg_temp.expect_error($$select public.mark_entered_in_error('filings',
  (select id from public.filings where matter_id = pg_temp.m() and form_type = 'I-140'), 'Wrong form')$$, '23514');
select public.mark_entered_in_error('filings', (select id from public.filings where matter_id = pg_temp.m() and form_type = 'I-130'), 'Wrong form');
do $$ begin
  assert (select count(*) from public.filings where matter_id = pg_temp.m()) = 2, 'nothing is deleted';
end $$;

-- A closed or declined matter can't be corrected.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.matters (code, summary, matter_type) values ('Matter D', 'Synthetic declined matter', 'petition');
insert into public.parties (matter_id, label, party_role) values ((select id from public.matters where code = 'Matter D'), 'Client 1', 'petitioner');
select public.decline_matter((select id from public.matters where code = 'Matter D'), 'Synthetic');
select pg_temp.expect_error($$select public.edit_record('parties',
  (select p.id from public.parties p join public.matters m on m.id = p.matter_id where m.code = 'Matter D'), '{"label": "Client 2"}')$$, '23514');

reset role;
select 'ALL CORRECTION TESTS PASSED';
rollback;
