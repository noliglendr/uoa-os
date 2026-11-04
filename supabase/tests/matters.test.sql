-- Increment 1 tests: stages, attorney gates (R3), notices and deadlines (R1),
-- closure (R4), response cycles, filings, appearances, no deletes, logging.
-- Synthetic data only. Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/matters.test.sql

begin;

-- expect_error(sql, sqlstate): fails unless the statement raises that error.
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

create function pg_temp.m() returns uuid language sql as $$ select current_setting('t.m')::uuid $$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Stage 1: intake (paralegal)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

insert into public.matters (code, summary, matter_type) values ('Matter T', 'Synthetic test petition', 'petition');
select set_config('t.m', (select id::text from public.matters where code = 'Matter T'), true);
insert into public.parties (matter_id, label, party_role) values (pg_temp.m(), 'Client 1', 'petitioner');

do $$ begin
  assert (select attorney_id from public.matters where id = pg_temp.m()) = '00000000-0000-0000-0000-00000000000a',
    'attorney of record defaults to the principal';
  assert (select status from public.matters where id = pg_temp.m()) = 'prospect', 'new matter is a prospect';
  assert exists (select 1 from public.event_log where event_type = 'matter.created' and matter_id = pg_temp.m()
                 and actor_id = '00000000-0000-0000-0000-00000000000b'), 'matter.created logged with the actor';
end $$;

select pg_temp.expect_error($$update public.matters set stage = 5 where code = 'Matter T'$$, '42501');
select pg_temp.expect_error($$update public.matters set status = 'active' where code = 'Matter T'$$, '42501');
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');  -- conflicts not cleared

update public.parties set conflict_cleared = true where matter_id = pg_temp.m();
do $$ begin
  assert public.advance_stage(pg_temp.m()) = 2, 'advance to stage 2';
end $$;

-- ---------------------------------------------------------------------------
-- Stage 2: engagement (attorney gate)
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');           -- no gate
select pg_temp.expect_error($$select public.approve_gate(pg_temp.m(), 2::smallint)$$, '42501'); -- paralegal
select pg_temp.expect_error($$insert into public.gates (matter_id, stage) values (pg_temp.m(), 2)$$, '42501');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.approve_gate(pg_temp.m(), 3::smallint)$$, '23514'); -- wrong stage
select public.approve_gate(pg_temp.m(), 2::smallint, null, 'Retainer signed');
do $$ begin
  assert (select status from public.matters where id = pg_temp.m()) = 'active', 'engagement makes the matter active';
  assert exists (select 1 from public.event_log where event_type = 'engagement.signed' and matter_id = pg_temp.m()
                 and actor_role = 'principal'), 'engagement.signed logged';
end $$;
select pg_temp.expect_error($$select public.approve_gate(pg_temp.m(), 2::smallint)$$, '23505');  -- only once

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin assert public.advance_stage(pg_temp.m()) = 3, 'advance to stage 3'; end $$;

-- ---------------------------------------------------------------------------
-- Stage 3: strategy; deadlines must be attorney-verified
-- ---------------------------------------------------------------------------
insert into public.deadlines (matter_id, kind, title, due_date) values (pg_temp.m(), 'response', 'Test deadline', current_date + 40);
select pg_temp.expect_error($$update public.deadlines set attorney_verified = true where matter_id = pg_temp.m()$$, '42501');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_gate(pg_temp.m(), 3::smallint);
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');  -- deadline not verified
update public.deadlines set attorney_verified = true where matter_id = pg_temp.m();
do $$ begin
  assert (select verified_by from public.deadlines where matter_id = pg_temp.m()) = '00000000-0000-0000-0000-00000000000a',
    'verifier recorded from the session';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.deadlines set due_date = due_date + 1 where matter_id = pg_temp.m();
do $$ begin
  assert not (select attorney_verified from public.deadlines where matter_id = pg_temp.m()), 'changing the date resets verification';
end $$;
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.deadlines set attorney_verified = true where matter_id = pg_temp.m();
do $$ begin assert public.advance_stage(pg_temp.m()) = 4, 'advance to stage 4'; end $$;

-- ---------------------------------------------------------------------------
-- Stage 4: evidence; third-party drafts need the attorney
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');  -- empty checklist
insert into public.checklist_items (matter_id, label, owner, status) values (pg_temp.m(), 'Civil documents', 'client', 'received');
insert into public.checklist_items (matter_id, label, owner, third_party_draft, status)
  values (pg_temp.m(), 'Expert letter', 'third_party', true, 'drafted');
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');  -- draft not reviewed
select pg_temp.expect_error($$update public.checklist_items set status = 'approved' where label = 'Expert letter'$$, '42501');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.checklist_items set status = 'approved' where label = 'Expert letter';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.advance_stage(pg_temp.m()) = 5, 'advance to stage 5';
  assert exists (select 1 from public.event_log where event_type = 'evidence.complete' and matter_id = pg_temp.m()), 'evidence.complete logged';
end $$;

-- ---------------------------------------------------------------------------
-- Stages 5 and 6: packet lock, filing, appearance
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_gate(pg_temp.m(), 5::smallint);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin assert public.advance_stage(pg_temp.m()) = 6, 'advance to stage 6'; end $$;

insert into public.filings (matter_id, form_type, forum, ref_no) values (pg_temp.m(), 'I-140', 'uscis', 'TEST-T-001');
select pg_temp.expect_error($$update public.filings set filed_at = now() where matter_id = pg_temp.m()$$, '23514'); -- no gate 6
select pg_temp.expect_error($$update public.filings set stage = 9 where matter_id = pg_temp.m()$$, '42501');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_gate(pg_temp.m(), 6::smallint);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.filings set filed_at = now(), filing_method = 'mail', fee_cents = 70000 where matter_id = pg_temp.m();
do $$ begin
  assert exists (select 1 from public.event_log where event_type = 'filing.submitted' and matter_id = pg_temp.m()), 'filing.submitted logged';
end $$;
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');  -- no appearance yet
select pg_temp.expect_error($$insert into public.appearances (matter_id, party_id, form, forum)
  select pg_temp.m(), id, 'eoir28', 'uscis' from public.parties where matter_id = pg_temp.m()$$, '23514');  -- wrong form
insert into public.appearances (matter_id, party_id, form, forum)
  select pg_temp.m(), id, 'g28', 'uscis' from public.parties where matter_id = pg_temp.m();
do $$ begin assert public.advance_stage(pg_temp.m()) = 7, 'advance to stage 7'; end $$;

-- ---------------------------------------------------------------------------
-- Stage 7-8: notices (R1), routing, receipts, response cycle
-- ---------------------------------------------------------------------------
select set_config('t.f', (select id::text from public.filings where matter_id = pg_temp.m()), true);

-- Paralegal logs a receipt with no deadline: an attorney review is created (R1).
select set_config('t.n1', public.log_notice(pg_temp.m(), current_setting('t.f')::uuid, 'receipt', 'mail',
                  current_date - 3, current_date)::text, true);
do $$ begin
  assert (select routed_to from public.notices where id = current_setting('t.n1')::uuid) = 'docketing', 'receipts go to docketing';
  assert exists (select 1 from public.deadlines where notice_id = current_setting('t.n1')::uuid and kind = 'review' and status = 'open'),
    'notice without a deadline creates an attorney review';
  assert (select receipt_logged_at is not null and stage = 7 from public.filings where id = current_setting('t.f')::uuid),
    'receipt notice logs the receipt';
  assert exists (select 1 from public.event_log where event_type = 'receipt.logged' and matter_id = pg_temp.m()), 'receipt.logged';
end $$;
select pg_temp.expect_error($$select public.log_notice(pg_temp.m(), null, 'receipt', 'mail', current_date, current_date, null, null, 'none')$$, '42501');
select pg_temp.expect_error($$select public.record_no_deadline(current_setting('t.n1')::uuid, 'Receipt only')$$, '42501');
select pg_temp.expect_error($$update public.deadlines set status = 'cancelled' where notice_id = current_setting('t.n1')::uuid$$, '42501');
select pg_temp.expect_error($$insert into public.notices (matter_id, notice_type, channel, notice_date, received_on, routed_to)
  values (pg_temp.m(), 'rfe', 'mail', current_date, current_date, 'x')$$, '42501');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.record_no_deadline(current_setting('t.n1')::uuid, 'Receipt only; monitoring on');
do $$ begin
  assert (select status from public.deadlines where notice_id = current_setting('t.n1')::uuid) = 'cancelled', 'review cancelled';
end $$;

-- R1 at commit: a notice with nothing attached is rejected.
reset role;
savepoint r1;
do $$ begin
  insert into public.notices (matter_id, notice_type, channel, notice_date, received_on, routed_to)
  values (pg_temp.m(), 'rfe', 'mail', current_date, current_date, '');
  begin
    set constraints all immediate;
    raise exception 'R1 must reject a notice without a deadline';
  exception when check_violation then null;
  end;
end $$;
rollback to savepoint r1;
set local role authenticated;

-- RFE with a deadline; filing moves to stage 8; response cycle runs 4-5-6 with its own gates.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select set_config('t.n2', public.log_notice(pg_temp.m(), current_setting('t.f')::uuid, 'rfe', 'mail',
  current_date - 2, current_date, null,
  jsonb_build_object('rule_code', 'U1', 'kind', 'response', 'title', 'RFE response', 'due_date', current_date + 80))::text, true);
do $$ begin
  assert (select routed_to from public.notices where id = current_setting('t.n2')::uuid) = 'attorney', 'RFE goes to the attorney';
  assert exists (select 1 from public.tasks where notice_id = current_setting('t.n2')::uuid and owner_role = 'attorney'
                 and due_date = current_date), 'same-day attorney task';
  assert (select stage from public.filings where id = current_setting('t.f')::uuid) = 8, 'RFE moves the filing to stage 8';
end $$;

select set_config('t.c', public.open_response_cycle(current_setting('t.f')::uuid, 'rfe', current_setting('t.n2')::uuid)::text, true);
select pg_temp.expect_error($$select public.advance_cycle(current_setting('t.c')::uuid)$$, '23514');  -- empty checklist
insert into public.checklist_items (matter_id, cycle_id, label, owner, status)
  values (pg_temp.m(), current_setting('t.c')::uuid, 'RFE evidence', 'firm', 'drafted');
do $$ begin assert public.advance_cycle(current_setting('t.c')::uuid) = 5, 'cycle to stage 5'; end $$;
select pg_temp.expect_error($$select public.advance_cycle(current_setting('t.c')::uuid)$$, '23514');  -- cycle gate 5
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.approve_gate(pg_temp.m(), 5::smallint, current_setting('t.c')::uuid);
do $$ begin assert public.advance_cycle(current_setting('t.c')::uuid) = 6, 'cycle to stage 6'; end $$;
select pg_temp.expect_error($$select public.advance_cycle(current_setting('t.c')::uuid)$$, '23514');  -- cycle gate 6
select public.approve_gate(pg_temp.m(), 6::smallint, current_setting('t.c')::uuid);
select public.advance_cycle(current_setting('t.c')::uuid);
do $$ begin
  assert (select status from public.response_cycles where id = current_setting('t.c')::uuid) = 'filed', 'response filed';
  assert (select status from public.deadlines where notice_id = current_setting('t.n2')::uuid) = 'met', 'RFE deadline met';
end $$;

-- ---------------------------------------------------------------------------
-- Stages 8-10: decision (the attorney tells the client), post-decision
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin assert public.advance_stage(pg_temp.m()) = 8, 'advance to stage 8'; end $$;
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');  -- no decision
update public.filings set decision = 'approved' where id = current_setting('t.f')::uuid;
do $$ begin assert public.advance_stage(pg_temp.m()) = 9, 'advance to stage 9'; end $$;
select pg_temp.expect_error($$update public.filings set client_informed_at = now() where id = current_setting('t.f')::uuid$$, '42501');
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.filings set client_informed_at = now() where id = current_setting('t.f')::uuid;
do $$ begin assert public.advance_stage(pg_temp.m()) = 10, 'advance to stage 10'; end $$;
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');  -- must use close_matter
update public.filings set post_decision = 'new_matter' where id = current_setting('t.f')::uuid;

-- ---------------------------------------------------------------------------
-- Stage 11: closure (R4)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.close_matter(pg_temp.m())$$, '42501');  -- attorney only
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.matters set closing_letter_sent = true where id = pg_temp.m();
select pg_temp.expect_error($$select public.close_matter(pg_temp.m())$$, '23514');  -- open deadline + open appearance
update public.deadlines set status = 'met' where matter_id = pg_temp.m() and status = 'open';
select pg_temp.expect_error($$select public.close_matter(pg_temp.m())$$, '23514');  -- open appearance

-- Transfer the open appearance to the successor matter (redline 7).
insert into public.matters (code, summary, matter_type, predecessor_id)
  values ('Matter T2', 'Synthetic next phase', 'application', pg_temp.m());
select pg_temp.expect_error($$update public.appearances set status = 'transferred' where matter_id = pg_temp.m()$$, '23514');
update public.appearances set status = 'transferred', transferred_to = (select id from public.matters where code = 'Matter T2')
  where matter_id = pg_temp.m();
select public.close_matter(pg_temp.m());
do $$ begin
  assert (select stage = 11 and status = 'closed' from public.matters where id = pg_temp.m()), 'matter closed';
  assert exists (select 1 from public.event_log where event_type = 'matter.closed' and matter_id = pg_temp.m()), 'matter.closed logged';
  assert exists (select 1 from public.event_log where event_type = 'appearance.transferred' and matter_id = pg_temp.m()), 'transfer logged';
  assert (select count(*) from public.event_log where event_type = 'matter.stage_changed' and matter_id = pg_temp.m()) = 9,
    'every stage change is logged';
  assert not exists (select 1 from public.event_log where matter_id = pg_temp.m() and actor_id is null),
    'every user change has an actor';
end $$;
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m())$$, '23514');

-- ---------------------------------------------------------------------------
-- Decline (prospect only, attorney only)
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($$select public.decline_matter(pg_temp.m(), 'x')$$, '23514');  -- not a prospect
select public.decline_matter((select id from public.matters where code = 'Matter T2'), 'Outside scope');
do $$ begin
  assert (select status from public.matters where code = 'Matter T2') = 'declined', 'declined';
end $$;

-- ---------------------------------------------------------------------------
-- Deadline rules: verified by the attorney only; changing a window resets it
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$update public.deadline_rules set attorney_verified = true where code = 'U2'$$, '42501');
select pg_temp.expect_error($$update public.deadline_rules set days = 31 where code = 'U2'$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.deadline_rules set attorney_verified = true where code = 'U2';
do $$ begin
  assert (select attorney_verified and verified_by is not null from public.deadline_rules where code = 'U2'), 'rule verified';
end $$;
update public.deadline_rules set days = 33 where code = 'U2';
do $$ begin
  assert not (select attorney_verified from public.deadline_rules where code = 'U2'), 'changing a rule resets verification';
  assert exists (select 1 from public.event_log where event_type = 'deadline_rule.updated' and entity_id = 'U2'), 'rule change logged';
end $$;

-- ---------------------------------------------------------------------------
-- Nothing is deleted; gates are immutable; no access without MFA
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($$delete from public.matters$$, '42501');
select pg_temp.expect_error($$update public.gates set note = 'x'$$, '42501');
reset role;
select pg_temp.expect_error($$delete from public.deadlines$$, '42501');
select pg_temp.expect_error($$update public.gates set note = 'x'$$, '42501');
select pg_temp.expect_error($$truncate public.tasks$$, '42501');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "aal": "aal1"}', true);
do $$ begin
  assert (select count(*) from public.matters) = 0, 'no MFA, no matters';
  assert (select count(*) from public.deadlines) = 0, 'no MFA, no deadlines';
end $$;
select pg_temp.expect_error($$select public.advance_stage(gen_random_uuid())$$, '42501');

reset role;
set local role anon;
select pg_temp.expect_error($$select count(*) from public.matters$$, '42501');

\echo 'ALL MATTER TESTS PASSED'
rollback;
