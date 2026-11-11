-- Outbox and invoices (Increment 4, Steps 2-4; decision #29). Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/outbox.test.sql

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

create function pg_temp.m(p_code text) returns uuid language sql as $$ select id from public.matters where code = p_code $$;
create function pg_temp.msg(p_kind text) returns uuid language sql as $$
  select id from public.client_messages where kind = p_kind and status = 'waiting' order by created_at desc, id limit 1 $$;
create function pg_temp.inv() returns uuid language sql as $$
  select id from public.invoices where matter_id = pg_temp.m('Matter G') order by created_at, id limit 1 $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- a = principal, b = paralegal, c = docketing, e = administrator, i = intake
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000e'),
  ('00000000-0000-0000-0000-000000000001');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal'),
  ('00000000-0000-0000-0000-00000000000c', 'Test Docketing', 'docketing'),
  ('00000000-0000-0000-0000-00000000000e', 'Test Administrator', 'administrator'),
  ('00000000-0000-0000-0000-000000000001', 'Test Intake', 'intake');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.matters (code, summary, matter_type) values
  ('Matter G', 'Synthetic outbox test', 'petition'),
  ('Matter H', 'Synthetic follow-up test', 'application');

-- Setup (filings and a stage-2 prospect), outside the rules under test.
reset role;
set local session_replication_role = replica;
insert into public.filings (matter_id, form_type, forum, filed_at) values
  (pg_temp.m('Matter G'), 'I-130', 'uscis', now() - interval '3 days'),
  (pg_temp.m('Matter G'), 'I-485', 'uscis', now() - interval '3 days');
update public.matters set stage = 2, stage_changed_at = now() - interval '10 days' where code = 'Matter H';
insert into public.checklist_items (matter_id, label, owner, status, updated_at) values
  (pg_temp.m('Matter H'), 'Passport copy', 'client', 'requested', now() - interval '10 days'),
  (pg_temp.m('Matter H'), 'Firm cover sheet', 'firm', 'needed', now() - interval '10 days');
set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Step 2: nothing is prepared until the attorney approves the template.
-- ---------------------------------------------------------------------------
update public.filings set receipt_logged_at = now() where form_type = 'I-130';
do $$ begin
  assert (select count(*) from public.client_messages) = 0, 'an unapproved template prepares nothing';
end $$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$update public.message_templates set attorney_approved = true where kind = 'receipt_update'$$, '42501');
select pg_temp.expect_error($$update public.message_templates set body = 'New' where kind = 'receipt_update'$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$update public.message_templates set body = 'Your A-123456789 case' where kind = 'receipt_update'$$, '23514');
update public.message_templates set attorney_approved = true where kind in ('receipt_update', 'appointment_update', 'engagement_followup', 'documents_followup');

-- A logged receipt prepares "receipt arrived", once, with only the firm's blanks filled.
reset role;
update public.filings set receipt_logged_at = now() where form_type = 'I-485';
select public.queue_client_message(pg_temp.m('Matter G'), 'receipt_update',
  'receipt:' || (select id from public.filings where form_type = 'I-485'), null, null, '{}'::jsonb);
do $$
declare b text := (select body from public.client_messages where kind = 'receipt_update');
begin
  assert (select count(*) from public.client_messages where kind = 'receipt_update') = 1, 'one message per receipt';
  assert b like '%I-485 filing%', 'the form name is filled';
  assert b like '%Test Principal%' and b not like '%[ATTORNEY NAME]%', 'the attorney name is filled';
  assert b like '%[CLIENT NAME]%', 'client details stay blank (R5)';
end $$;

-- Staff see the Outbox; nobody writes to it directly.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from public.client_messages) = 1, 'staff see the Outbox';
end $$;
select pg_temp.expect_error($$update public.client_messages set status = 'sent'$$, '42501');
select pg_temp.expect_error($$insert into public.client_messages (matter_id, kind, template_version, item_key, body) values (pg_temp.m('Matter G'), 'receipt_update', 1, 'x', 'x')$$, '42501');

-- A biometrics appointment prepares "appointment scheduled"; a new date replaces it.
select public.log_notice(pg_temp.m('Matter G'), (select id from public.filings where form_type = 'I-485'), 'biometrics', 'mail',
  current_date, current_date, null,
  jsonb_build_object('kind', 'appointment', 'title', 'Biometrics', 'trigger_date', current_date,
                     'raw_due_date', current_date + 20, 'due_date', current_date + 20));
do $$ begin
  assert (select count(*) from public.client_messages where kind = 'appointment_update' and status = 'waiting') = 1, 'appointment update prepared';
  assert (select body from public.client_messages where kind = 'appointment_update') like '%biometrics appointment is scheduled for%',
    'appointment type filled';
end $$;
reset role;
update public.deadlines set due_date = current_date + 27 where kind = 'appointment';
do $$ begin
  assert (select count(*) from public.client_messages where kind = 'appointment_update' and status = 'cancelled'
          and cancel_reason = 'The appointment date changed') = 1, 'the old date is cancelled';
  assert (select count(*) from public.client_messages where kind = 'appointment_update' and status = 'waiting') = 1, 'the new date is prepared';
end $$;

-- Staff send it themselves and record how. Intake and administrators can't.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select public.mark_message_sent(pg_temp.msg('receipt_update'), 'email')$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$select public.mark_message_sent(pg_temp.msg('receipt_update'), 'email')$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.mark_message_sent(pg_temp.msg('receipt_update'), 'pigeon')$$, '23514');
select public.mark_message_sent(pg_temp.msg('receipt_update'), 'email');
do $$ begin
  assert (select status = 'sent' and sent_by = '00000000-0000-0000-0000-00000000000b' and sent_via = 'email'
          from public.client_messages where kind = 'receipt_update'), 'sent is recorded with who and how';
  assert exists (select 1 from public.event_log where entity_type = 'client_message' and event_type = 'client_message.updated'), 'sending is logged';
end $$;
select pg_temp.expect_error($$select public.cancel_message((select id from public.client_messages where kind = 'receipt_update'), 'x')$$, '23514');

-- Cancelling needs a reason. A withdrawn template blocks sending.
select pg_temp.expect_error($$select public.cancel_message(pg_temp.msg('appointment_update'), ' ')$$, '23514');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.message_templates set attorney_approved = false where kind = 'appointment_update';
select pg_temp.expect_error($$select public.mark_message_sent(pg_temp.msg('appointment_update'), 'phone')$$, '23514');
select public.cancel_message(pg_temp.msg('appointment_update'), 'Told the client by phone');

-- ---------------------------------------------------------------------------
-- Step 3: client follow-ups (the daily job only).
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($$select public.queue_client_followups()$$, '42501');
reset role;
set local role service_role;
do $$
declare r jsonb := public.queue_client_followups();
begin
  assert (r ->> 'prepared')::int = 2, 'engagement and documents follow-ups prepared: ' || r;
  assert (select body from public.client_messages where kind = 'documents_followup') like '%- Passport copy%', 'client items listed';
  assert (select body from public.client_messages where kind = 'documents_followup') not like '%Firm cover sheet%', 'firm items left out';
  assert (public.queue_client_followups() ->> 'prepared')::int = 0, 'not prepared twice';
end $$;

-- A received document ends its follow-up.
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.checklist_items set status = 'received' where label = 'Passport copy';
set local role service_role;
do $$
declare r jsonb := public.queue_client_followups();
begin
  assert (r ->> 'cancelled')::int = 1, 'no longer needed is cancelled: ' || r;
  assert (select status from public.client_messages where kind = 'documents_followup') = 'cancelled', 'documents follow-up cancelled';
  assert (select status from public.client_messages where kind = 'engagement_followup') = 'waiting', 'engagement follow-up still waiting';
end $$;

-- ---------------------------------------------------------------------------
-- Step 4: invoices.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.add_fee_phase('petition', 'decision', 'Decision fee', 50000)$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.save_fee_phase((select id from public.fee_schedule where matter_type = 'petition' and trigger = 'filing'),
                             'Filing phase fee', 150000, true);

-- Reaching a fee phase prepares a draft (engagement has no amount yet).
select public.log_event('engagement.signed', 'gate', '1', pg_temp.m('Matter G'), '{}'::jsonb);
select public.log_event('filing.submitted', 'filing', '1', pg_temp.m('Matter G'), '{}'::jsonb);
select public.log_event('strategy.approved', 'gate', '2', pg_temp.m('Matter G'), '{}'::jsonb);
do $$ begin
  assert (select count(*) from public.invoices) = 2, 'one draft per fee phase reached';
  assert (select amount_cents from public.invoices where label = 'Filing phase fee') = 150000, 'the schedule amount is used';
  assert (select amount_cents is null and status = 'draft' from public.invoices where label = 'Engagement fee'), 'no amount until the attorney sets one';
end $$;

-- Paralegals don't see billing; only the attorney sets amounts and approves.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.invoices) = 0, 'paralegal does not see invoices';
end $$;
select pg_temp.expect_error($$select public.set_invoice_amount(pg_temp.inv(), 1000)$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$select public.approve_invoice(pg_temp.inv())$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.approve_invoice(pg_temp.inv())$$, '23514');
select pg_temp.expect_error($$select public.set_invoice_amount(pg_temp.inv(), 0)$$, '23514');
select public.set_invoice_amount(pg_temp.inv(), 250000, 'First fee phase');
select pg_temp.expect_error($$select public.record_invoice_sent(pg_temp.inv(), 'INV-1')$$, '23514');
select public.approve_invoice(pg_temp.inv());
select pg_temp.expect_error($$select public.set_invoice_amount(pg_temp.inv(), 1000)$$, '23514');

-- The billing tool sends it; staff record its reference.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$select public.record_invoice_sent(pg_temp.inv(), ' ')$$, '23514');
select public.record_invoice_sent(pg_temp.inv(), 'INV-1');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.void_invoice(pg_temp.inv(), '')$$, '23514');
select public.void_invoice(pg_temp.inv(), 'Billed twice in the billing tool');
select pg_temp.expect_error($$select public.void_invoice(pg_temp.inv(), 'Again')$$, '23514');
select pg_temp.expect_error($$update public.invoices set amount_cents = 1$$, '42501');

-- Off switch: no drafts.
update public.settings set value = 'false' where key = 'billing.invoice_drafts';
select public.log_event('filing.submitted', 'filing', '2', pg_temp.m('Matter G'), '{}'::jsonb);
do $$ begin
  assert (select count(*) from public.invoices) = 2, 'no drafts while off';
  assert exists (select 1 from public.event_log where event_type = 'invoice.updated'), 'invoice changes are logged';
end $$;

reset role;
select pg_temp.expect_error($$delete from public.invoices$$, '42501');
select pg_temp.expect_error($$delete from public.client_messages$$, '42501');

select 'OUTBOX TESTS PASSED';
rollback;
