-- Staff follow-ups (Increment 4, Step 1; decision #28). Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/followups.test.sql

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

create function pg_temp.m() returns uuid language sql as $$ select id from public.matters where code = 'Matter F' $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- a = principal, c = docketing
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000c', 'Test Docketing', 'docketing');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.matters (code, summary, matter_type) values ('Matter F', 'Synthetic follow-ups test', 'petition');

-- A filed filing with no receipt (setup only: the filing gates are tested in matters.test.sql).
reset role;
set local session_replication_role = replica;
insert into public.filings (matter_id, form_type, forum, filed_at) values (pg_temp.m(), 'I-130', 'uscis', now() - interval '5 days');
-- A system event (a reminder email) dated later than any staff event.
insert into public.event_log (occurred_at, event_type, entity_type, matter_id) values (now() + interval '1 day', 'deadline.escalated', 'deadline', pg_temp.m());
set local session_replication_role = origin;

-- Staff see the late receipt in "My work"; the setting defaults to 1 business day.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert jsonb_array_length(public.dashboard_data() -> 'awaiting_receipt') = 1, 'the filed filing awaits its receipt';
  assert public.dashboard_data() ->> 'receipt_days' = '15', 'receipt follow-up waits 15 business days (receipts take weeks)';
  assert (select value from public.settings where key = 'followup.emails') = 'true'::jsonb, 'follow-up emails default on';
  -- Reminder emails are system events: they never make a matter look active.
  assert (public.dashboard_data() -> 'last_activity' ->> pg_temp.m()::text)::timestamptz <= now(),
    'last activity counts staff events only';
end $$;

-- Only the daily job reads follow-up data or records sent emails.
select pg_temp.expect_error($$select public.followup_data()$$, '42501');
select pg_temp.expect_error($$insert into public.followups_sent (item_key, sent_on, recipients, delivered) values ('receipt:x', current_date, 1, true)$$, '42501');
do $$ begin
  assert (select count(*) from public.followups_sent) = 0, 'staff can read the sent list';
end $$;

reset role;
set local role service_role;
do $$
declare d jsonb := public.followup_data();
begin
  assert jsonb_array_length(d -> 'awaiting_receipt') = 1, 'the daily job sees the late receipt';
  assert jsonb_array_length(d -> 'matters') = 1, 'the daily job sees open matters';
  assert (d -> 'matters' -> 0 ->> 'last')::timestamptz <= now(), 'the daily job ignores system events too';
  assert d -> 'settings' ->> 'followup.receipt_business_days' = '15', 'settings reach the daily job';
end $$;
insert into public.followups_sent (item_key, matter_id, sent_on, recipients, delivered)
values ('receipt:' || gen_random_uuid(), pg_temp.m(), current_date, 2, false);
select pg_temp.expect_error($$insert into public.followups_sent (item_key, sent_on, recipients, delivered) values ('other:x', current_date, 1, true)$$, '23514');
select pg_temp.expect_error($$delete from public.followups_sent$$, '42501');
do $$ begin
  assert jsonb_array_length(public.followup_data() -> 'sent') = 1, 'sent items are not sent again';
end $$;

-- Logging the receipt ends the follow-up.
reset role;
set local session_replication_role = replica;
update public.filings set receipt_logged_at = now() where matter_id = pg_temp.m();
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert jsonb_array_length(public.dashboard_data() -> 'awaiting_receipt') = 0, 'a logged receipt is no longer late';
end $$;

select 'FOLLOWUPS TESTS PASSED';
rollback;
