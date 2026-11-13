-- End to end (docs/prototype-test-script.md): Matters A, B and C from the
-- seed to closure, with every feature on the way, done as staff the way the
-- app does it (same tables, columns and functions). Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/e2e.test.sql

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

create function pg_temp.a() returns void language sql as $$ select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') $$;
create function pg_temp.b() returns void language sql as $$ select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') $$;
create function pg_temp.c() returns void language sql as $$ select pg_temp.as_user('00000000-0000-0000-0000-00000000000c') $$;
create function pg_temp.m(p_code text) returns uuid language sql as $$ select id from public.matters where code = p_code $$;
create function pg_temp.f(p_code text, p_form text) returns uuid language sql as $$
  select id from public.filings where matter_id = pg_temp.m(p_code) and form_type = p_form and voided_at is null $$;
create function pg_temp.h(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
-- Failed exit or closure checks of a matter, for clear messages.
create function pg_temp.failing(p_code text) returns text language sql as $$
  select coalesce(string_agg(item, '; '), 'none') from public.exit_checks(pg_temp.m(p_code)) where not ok $$;
create function pg_temp.closing(p_code text) returns text language sql as $$
  select coalesce(string_agg(item, '; '), 'none') from public.closure_checks(pg_temp.m(p_code)) where not ok $$;
-- Move a matter on until it reaches p_stage.
create function pg_temp.advance_to(p_code text, p_stage int) returns void language plpgsql as $$
begin
  while (select stage from public.matters where code = p_code) < p_stage loop
    perform public.advance_stage(pg_temp.m(p_code));
  end loop;
end $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- a = principal (approves, like Frank), b = paralegal, c = docketing
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal'),
  ('00000000-0000-0000-0000-00000000000c', 'Test Docketing', 'docketing');

\ir ../seed/matters_abc.sql

-- ===========================================================================
-- 0. Before you start: settings, templates, fee schedule (principal)
-- ===========================================================================
set local role authenticated;
select pg_temp.a();
update public.settings set value = 'true' where key in ('drafting.enabled', 'drafting.case_facts');
update public.draft_templates set attorney_approved = true;
update public.message_templates set attorney_approved = true;
select public.save_fee_phase(id, label, case trigger when 'engagement' then 150000 else 250000 end, true)
from public.fee_schedule where matter_type in ('petition', 'application', 'eoir_litigation');
select public.add_fee_phase('petition', 'response', 'RFE response fee', 100000);

do $$ begin
  assert (select stage from public.matters where code = 'Matter A') = 8, 'Matter A starts at stage 8';
  assert (select stage from public.matters where code = 'Matter B') = 3, 'Matter B starts at stage 3';
  assert (select stage from public.matters where code = 'Matter C') = 8, 'Matter C starts at stage 8';
  -- Seeded engagements came before any fee amount: drafts with no amount.
  assert (select count(*) from public.invoices i join public.fee_schedule f on f.id = i.fee_phase_id
          where f.trigger = 'engagement' and i.amount_cents is null) = 3, 'seed engagement invoice drafts';
  -- One filing-phase invoice per matter, even for Matter C's bundle of 4 forms (L2).
  assert (select count(*) from public.invoices i join public.fee_schedule f on f.id = i.fee_phase_id where f.trigger = 'filing') = 2,
    'seed filing invoice drafts (A: 1, C: 1 for 4 forms)';
end $$;

-- ===========================================================================
-- 1. Where am I needed
-- ===========================================================================
do $$
declare d jsonb := public.dashboard_data();
begin
  assert exists (select 1 from jsonb_array_elements(d -> 'matters') m where m ->> 'code' = 'Matter B' and (m ->> 'urgent')::boolean), 'Matter B is urgent';
  assert jsonb_array_length(d -> 'deadlines') >= 3, 'open deadlines listed';
  assert exists (select 1 from jsonb_array_elements(d -> 'deadlines') x where not (x ->> 'attorney_verified')::boolean), 'a deadline to verify';
end $$;
-- Verify every open deadline (the attorney checked each against its notice).
update public.deadlines set attorney_verified = true where status = 'open' and not attorney_verified and kind <> 'review';

-- ===========================================================================
-- 2. Rules
-- ===========================================================================
select pg_temp.b();
select pg_temp.expect_error($$select public.advance_stage(pg_temp.m('Matter B'))$$, '23514');   -- strategy not approved
select pg_temp.expect_error($$select public.approve_gate(pg_temp.m('Matter B'), 3::smallint)$$, '42501');  -- staff can't approve
select pg_temp.a();
select pg_temp.expect_error($$select public.close_matter(pg_temp.m('Matter C'))$$, '23514');   -- R4
-- R1: a notice with no deadline goes to the attorney.
select pg_temp.c();
select public.log_notice(pg_temp.m('Matter A'), null, 'other', 'mail', current_date, current_date);
do $$ begin
  assert exists (select 1 from public.deadlines where matter_id = pg_temp.m('Matter A') and kind = 'review' and status = 'open'), 'R1 review item';
end $$;
select pg_temp.expect_error($$select public.record_no_deadline((select id from public.notices where matter_id = pg_temp.m('Matter A') and notice_type = 'other'), 'x')$$, '42501');
select pg_temp.a();
select public.record_no_deadline((select id from public.notices where matter_id = pg_temp.m('Matter A') and notice_type = 'other'), 'Courtesy copy; nothing to do');
do $$ begin
  assert not exists (select 1 from public.deadlines where matter_id = pg_temp.m('Matter A') and kind = 'review' and status = 'open'), 'review item closed';
end $$;

-- R1 is checked when each save ends (deferred); check every notice so far.
set constraints all immediate;
set constraints all deferred;

-- ===========================================================================
-- 3. Matter A: RFE response to closure
-- ===========================================================================
select pg_temp.b();
-- Only the attorney approves a third-party draft.
select pg_temp.expect_error($$update public.checklist_items set status = 'approved' where label = 'Updated expert letter'$$, '42501');
select pg_temp.a();
update public.checklist_items set status = 'approved' where label = 'Updated expert letter';
select pg_temp.b();
update public.checklist_items set status = 'drafted' where label = 'Response brief';
update public.checklist_items set status = 'received' where label = 'New citation evidence';

-- AI outline (dry run text): the draft waits for the attorney.
select public.create_draft(pg_temp.m('Matter A'), 'response_outline', null, 'RESPONSE OUTLINE [ATTORNEY TO WRITE ARGUMENT]', 'test',
  (select id from public.response_cycles where matter_id = pg_temp.m('Matter A')), '{"issues": ["National importance"]}');
select pg_temp.a();
select public.review_draft((select id from public.drafts where kind = 'response_outline'), 'approved');

-- Response stages 4 -> 5 -> 6 -> filed, with the attorney's two approvals.
select pg_temp.b();
select public.advance_cycle((select id from public.response_cycles where matter_id = pg_temp.m('Matter A')));
select pg_temp.a();
select public.approve_gate(pg_temp.m('Matter A'), 5::smallint, (select id from public.response_cycles where matter_id = pg_temp.m('Matter A')));
select pg_temp.b();
select public.advance_cycle((select id from public.response_cycles where matter_id = pg_temp.m('Matter A')));
select pg_temp.expect_error($$select public.advance_cycle((select id from public.response_cycles where matter_id = pg_temp.m('Matter A')))$$, '23514');
select pg_temp.a();
select public.approve_gate(pg_temp.m('Matter A'), 6::smallint, (select id from public.response_cycles where matter_id = pg_temp.m('Matter A')));
select pg_temp.b();
select public.advance_cycle((select id from public.response_cycles where matter_id = pg_temp.m('Matter A')));
do $$ begin
  assert (select status from public.response_cycles where matter_id = pg_temp.m('Matter A')) = 'filed', 'response filed';
  assert (select status from public.deadlines where matter_id = pg_temp.m('Matter A') and title = 'RFE response (I-140)') = 'met', 'RFE deadline met';
end $$;
-- Paralegals don't see billing; the principal does.
do $$ begin
  assert not exists (select 1 from public.invoices), 'paralegal sees no invoices';
end $$;
select pg_temp.a();
do $$ begin
  assert (select amount_cents from public.invoices where label = 'RFE response fee') = 100000, 'response fee invoice drafted';
end $$;

-- Decision notice (docketing logs it; the attorney sets "no deadline"), decision, tell the client.
select pg_temp.c();
select public.log_notice(pg_temp.m('Matter A'), pg_temp.f('Matter A', 'I-140'), 'decision', 'mail', current_date, current_date);
select pg_temp.a();
select public.record_no_deadline((select id from public.notices where matter_id = pg_temp.m('Matter A') and notice_type = 'decision'), 'Approval; no response needed');
select pg_temp.b();
update public.filings set decision = 'approved' where id = pg_temp.f('Matter A', 'I-140');
select pg_temp.expect_error($$update public.filings set client_informed_at = now() where id = pg_temp.f('Matter A', 'I-140')$$, '42501');
do $$ begin
  assert exists (select 1 from jsonb_array_elements(public.dashboard_data() -> 'untold') x where x ->> 'form_type' = 'I-140'), '"Tell the client" listed';
end $$;
select pg_temp.a();
update public.filings set client_informed_at = now() where id = pg_temp.f('Matter A', 'I-140');
update public.filings set post_decision = 'approval_delivered' where id = pg_temp.f('Matter A', 'I-140');
select pg_temp.b();
do $$ begin perform pg_temp.advance_to('Matter A', 10); exception when others then
  raise exception 'Matter A could not reach stage 10: % (failing: %)', sqlerrm, pg_temp.failing('Matter A'); end $$;

-- Closure: open deadlines, the G-28, the closing letter, then the attorney closes.
update public.deadlines set status = 'met' where matter_id = pg_temp.m('Matter A') and status = 'open' and kind <> 'review';
update public.appearances set status = 'closed' where matter_id = pg_temp.m('Matter A');
update public.matters set closing_letter_sent = true where code = 'Matter A';
select pg_temp.expect_error($$select public.close_matter(pg_temp.m('Matter A'))$$, '42501');
select pg_temp.a();
do $$ begin perform public.close_matter(pg_temp.m('Matter A')); exception when others then
  raise exception 'Matter A could not close: % (failing: %)', sqlerrm, pg_temp.closing('Matter A'); end $$;
do $$ begin
  assert (select status from public.matters where code = 'Matter A') = 'closed', 'Matter A closed';
end $$;

-- R1 is checked when each save ends (deferred); check every notice so far.
set constraints all immediate;
set constraints all deferred;

-- ===========================================================================
-- 4. Matter B: strategy to closure, with client documents
-- ===========================================================================
select public.approve_gate(pg_temp.m('Matter B'), 3::smallint, null, 'Strategy memo approved');
select pg_temp.b();
select public.advance_stage(pg_temp.m('Matter B'));

-- Upload link for the client declaration; the client uploads, staff reject then accept.
select public.create_doc_request(pg_temp.m('Matter B'), null,
  array[(select id from public.checklist_items where label = 'Client declaration')], current_date + 7, pg_temp.h('tokB'), pg_temp.h('tokB:246810'));
reset role;
set local role service_role;
do $$
declare p text := pg_temp.m('Matter B') || '/' || (select id from public.doc_requests where matter_id = pg_temp.m('Matter B')) || '/';
begin
  assert public.doc_verify_code(pg_temp.h('tokB'), pg_temp.h('tokB:000000'), pg_temp.h('sB')) = 'wrong', 'wrong code';
  assert public.doc_verify_code(pg_temp.h('tokB'), pg_temp.h('tokB:246810'), pg_temp.h('sB')) = 'ok', 'right code';
  perform public.record_client_upload(pg_temp.h('tokB'), pg_temp.h('sB'), (select id from public.checklist_items where label = 'Client declaration'), p || '1.pdf', 'application/pdf', 5000);
end $$;
reset role;
set local role authenticated;
select pg_temp.b();
select public.review_document((select id from public.documents where storage_path like '%/1.pdf'), 'rejected', 'Page 2 is missing');
do $$ begin
  assert (select status from public.checklist_items where label = 'Client declaration') = 'requested', 'rejected: requested again';
end $$;
reset role;
set local role service_role;
select public.record_client_upload(pg_temp.h('tokB'), pg_temp.h('sB'), (select id from public.checklist_items where label = 'Client declaration'),
  pg_temp.m('Matter B') || '/' || (select id from public.doc_requests where matter_id = pg_temp.m('Matter B')) || '/2.pdf', 'application/pdf', 6000);
reset role;
set local role authenticated;
select pg_temp.b();
select public.review_document((select id from public.documents where storage_path like '%/2.pdf'), 'accepted');
do $$ begin
  assert (select count(*) from public.documents_zip_access(pg_temp.m('Matter B'))) = 2, 'ZIP has both files';
end $$;

-- AI statement (dry run text), then the rest of the evidence.
select public.create_draft(pg_temp.m('Matter B'), 'statement_draft', null, 'STATEMENT OF [DECLARANT NAME]', 'test', null, '{"facts": ["Lived in the city since [YEAR]"]}');
update public.checklist_items set status = 'received' where matter_id = pg_temp.m('Matter B') and status <> 'received';
select public.advance_stage(pg_temp.m('Matter B'));
select pg_temp.a();
select public.approve_gate(pg_temp.m('Matter B'), 5::smallint);
select pg_temp.b();
select public.advance_stage(pg_temp.m('Matter B'));

-- Stage 6: the motion filing, the attorney's approval, and an appearance in the
-- filing's forum: a G-28 alone does not cover the immigration court (redline 6, L3).
insert into public.filings (matter_id, form_type, forum) values (pg_temp.m('Matter B'), 'Motion to reopen', 'immigration_court');
insert into public.appearances (matter_id, party_id, form, forum, filed_on)
select pg_temp.m('Matter B'), p.id, 'g28', 'uscis', current_date from public.parties p where p.matter_id = pg_temp.m('Matter B');
do $$ begin
  assert exists (select 1 from public.exit_checks(pg_temp.m('Matter B')) where item like 'Appearance form on file%' and not ok),
    'a G-28 does not cover an immigration court filing';
end $$;
insert into public.appearances (matter_id, party_id, form, forum, filed_on)
select pg_temp.m('Matter B'), p.id, 'eoir28', 'immigration_court', current_date from public.parties p where p.matter_id = pg_temp.m('Matter B');
select pg_temp.expect_error($$update public.filings set filed_at = now() where id = pg_temp.f('Matter B', 'Motion to reopen')$$, '23514');  -- R3
select pg_temp.a();
select public.approve_gate(pg_temp.m('Matter B'), 6::smallint);
select pg_temp.b();
update public.filings set filed_at = now(), filing_method = 'ECAS', proof_ref = 'TEST-ECAS-B' where id = pg_temp.f('Matter B', 'Motion to reopen');
select pg_temp.a();
do $$ begin
  assert (select i.amount_cents from public.invoices i join public.fee_schedule f on f.id = i.fee_phase_id
          where i.matter_id = pg_temp.m('Matter B') and f.trigger = 'filing') = 250000, 'filing fee invoice drafted';
end $$;
select pg_temp.b();
select public.advance_stage(pg_temp.m('Matter B'));
-- The court's filing confirmation is logged as the receipt (stage 7).
select pg_temp.c();
select public.log_notice(pg_temp.m('Matter B'), pg_temp.f('Matter B', 'Motion to reopen'), 'receipt', 'court', current_date, current_date);
select pg_temp.a();
select public.record_no_deadline((select id from public.notices where matter_id = pg_temp.m('Matter B') and notice_type = 'receipt'), 'Receipt only');

-- A hearing: appointment deadline, attorney task, no automatic client update.
select pg_temp.c();
select public.log_notice(pg_temp.m('Matter B'), pg_temp.f('Matter B', 'Motion to reopen'), 'hearing', 'court', current_date, current_date, null,
  jsonb_build_object('kind', 'appointment', 'title', 'Hearing', 'trigger_date', current_date, 'raw_due_date', current_date + 30,
                     'due_date', current_date + 30, 'attendee', 'Client 1'));
do $$ begin
  assert not exists (select 1 from public.client_messages where matter_id = pg_temp.m('Matter B') and kind = 'appointment_update'), 'no client update for a hearing';
  assert exists (select 1 from public.tasks where matter_id = pg_temp.m('Matter B') and owner_role = 'attorney' and title like 'Review hearing%'), 'attorney task for the hearing';
end $$;
select pg_temp.b();
do $$ begin perform pg_temp.advance_to('Matter B', 8); exception when others then
  raise exception 'Matter B could not reach stage 8: % (failing: %)', sqlerrm, pg_temp.failing('Matter B'); end $$;
update public.deadlines set status = 'met' where matter_id = pg_temp.m('Matter B') and status = 'open' and kind <> 'review';
update public.filings set decision = 'granted' where id = pg_temp.f('Matter B', 'Motion to reopen');
select pg_temp.expect_error($$update public.filings set post_decision = 'none' where id = pg_temp.f('Matter B', 'Motion to reopen')$$, '42501');
select pg_temp.a();
update public.filings set client_informed_at = now() where id = pg_temp.f('Matter B', 'Motion to reopen');
-- An appeal (L4) needs its hard deadline on the calendar first; this matter takes no appeal.
select pg_temp.expect_error($$update public.filings set post_decision = 'appeal' where id = pg_temp.f('Matter B', 'Motion to reopen')$$, '23514');
update public.filings set post_decision = 'none' where id = pg_temp.f('Matter B', 'Motion to reopen');
select pg_temp.b();
do $$ begin perform pg_temp.advance_to('Matter B', 10); exception when others then
  raise exception 'Matter B could not reach stage 10: % (failing: %)', sqlerrm, pg_temp.failing('Matter B'); end $$;
update public.appearances set status = 'closed' where matter_id = pg_temp.m('Matter B');
update public.matters set closing_letter_sent = true where code = 'Matter B';
select pg_temp.a();
do $$ begin perform public.close_matter(pg_temp.m('Matter B')); exception when others then
  raise exception 'Matter B could not close: % (failing: %)', sqlerrm, pg_temp.closing('Matter B'); end $$;

-- R1 is checked when each save ends (deferred); check every notice so far.
set constraints all immediate;
set constraints all deferred;

-- ===========================================================================
-- 5. Matter C: client outbox, 4 decisions, closure
-- ===========================================================================
select pg_temp.c();
select public.log_notice(pg_temp.m('Matter C'), pg_temp.f('Matter C', 'I-485'), 'biometrics', 'mail', current_date, current_date, null,
  jsonb_build_object('kind', 'appointment', 'title', 'Biometrics (new)', 'trigger_date', current_date, 'raw_due_date', current_date + 20,
                     'due_date', current_date + 20, 'attendee', 'Client 2'));
do $$ begin
  assert (select count(*) from public.client_messages where matter_id = pg_temp.m('Matter C') and kind = 'appointment_update' and status = 'waiting') = 1,
    'appointment update prepared';
  assert (select body from public.client_messages where matter_id = pg_temp.m('Matter C') and kind = 'appointment_update') like '%[CLIENT NAME]%', 'client name stays blank';
end $$;
-- A new date (corrected through "Edit") replaces the waiting message.
select public.edit_record('deadlines', (select id from public.deadlines where title = 'Biometrics (new)'),
                          jsonb_build_object('due_date', current_date + 27));
do $$ begin
  assert (select count(*) from public.client_messages where matter_id = pg_temp.m('Matter C') and kind = 'appointment_update' and status = 'cancelled') = 1, 'old date cancelled';
  assert (select count(*) from public.client_messages where matter_id = pg_temp.m('Matter C') and kind = 'appointment_update' and status = 'waiting') = 1, 'new date prepared';
end $$;
select public.mark_message_sent((select id from public.client_messages where matter_id = pg_temp.m('Matter C') and status = 'waiting' limit 1), 'email');

-- Appointments attended; four decisions, each told by the attorney.
update public.deadlines set status = 'met' where matter_id = pg_temp.m('Matter C') and status = 'open' and kind = 'appointment';
select pg_temp.b();
update public.filings set decision = 'approved' where matter_id = pg_temp.m('Matter C');
select pg_temp.a();
update public.filings set client_informed_at = now(), post_decision = 'approval_delivered' where matter_id = pg_temp.m('Matter C');
select pg_temp.b();
do $$ begin perform pg_temp.advance_to('Matter C', 10); exception when others then
  raise exception 'Matter C could not reach stage 10: % (failing: %)', sqlerrm, pg_temp.failing('Matter C'); end $$;
update public.deadlines set status = 'met' where matter_id = pg_temp.m('Matter C') and status = 'open' and kind <> 'review';
update public.appearances set status = 'closed' where matter_id = pg_temp.m('Matter C');
update public.matters set closing_letter_sent = true where code = 'Matter C';
select pg_temp.a();
do $$ begin perform public.close_matter(pg_temp.m('Matter C')); exception when others then
  raise exception 'Matter C could not close: % (failing: %)', sqlerrm, pg_temp.closing('Matter C'); end $$;

-- R1 is checked when each save ends (deferred); check every notice so far.
set constraints all immediate;
set constraints all deferred;

-- ===========================================================================
-- 6-7. Follow-ups, invoices, records
-- ===========================================================================
reset role;
set local role service_role;
do $$
declare d jsonb := public.followup_data();
begin
  assert jsonb_array_length(d -> 'matters') = 0, 'no open matters left for follow-ups';
  assert (public.queue_client_followups() ->> 'prepared')::int = 0, 'nothing to prepare for closed matters';
end $$;
reset role;
set local role authenticated;
select pg_temp.a();
select public.set_invoice_amount((select id from public.invoices where matter_id = pg_temp.m('Matter A') and amount_cents is null limit 1), 150000);
select public.approve_invoice((select id from public.invoices where matter_id = pg_temp.m('Matter A') and status = 'draft' and amount_cents is not null limit 1));
select public.record_invoice_sent((select id from public.invoices where status = 'approved' limit 1), 'TEST-1');
select public.void_invoice((select id from public.invoices where status = 'draft' limit 1), 'Test');
do $$ begin
  assert (select count(*) from public.matters where status = 'closed') = 3, 'all three matters closed';
  assert (select count(*) from public.invoices where status = 'sent') = 1, 'one invoice in the billing tool';
  assert (select count(*) from public.drafts where kind in ('response_outline', 'statement_draft')) = 2, 'both Step B drafts kept';
  assert not exists (select 1 from public.event_log where matter_id is not null and occurred_at is null), 'every event has a time';
  assert (select count(*) from public.event_log where matter_id = pg_temp.m('Matter A') and event_type = 'matter.closed') = 1, 'closure logged';
  assert public.matter_page(pg_temp.m('Matter B')) is not null, 'a closed matter page still opens';
  -- Closing ends the leftover work (found in the live test, Nov 11).
  assert not exists (select 1 from public.tasks t join public.matters m on m.id = t.matter_id
                     where m.status = 'closed' and t.status = 'open'), 'no open tasks on closed matters';
  assert not exists (select 1 from public.client_messages x join public.matters m on m.id = x.matter_id
                     where m.status = 'closed' and x.status = 'waiting'), 'no waiting messages on closed matters';
end $$;

-- R1 is checked when each save ends (deferred); check every notice so far.
set constraints all immediate;
set constraints all deferred;

-- Closed files (decision #36): only the attorney places a legal hold, and
-- nothing else on a closed matter changes. Only the principal marks test data.
reset role;
set local role authenticated;
select pg_temp.b();
select pg_temp.expect_error($$update public.matters set legal_hold = true where code = 'Matter A'$$, '42501');
select pg_temp.expect_error($$update public.matters set test_data = true where code = 'Matter A'$$, '42501');
select pg_temp.a();
update public.matters set legal_hold = true where code = 'Matter A';
update public.matters set test_data = true where code = 'Matter A';
select pg_temp.expect_error($$update public.matters set summary = 'Changed after closing' where code = 'Matter A'$$, '23514');
do $$ begin
  assert (select legal_hold and test_data from public.matters where code = 'Matter A'), 'hold and test mark set on a closed matter';
end $$;

select 'E2E TESTS PASSED';
rollback;
