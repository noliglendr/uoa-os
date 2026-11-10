-- AI letter drafts (decisions #22, #23). Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/drafts.test.sql

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

create function pg_temp.m() returns uuid language sql as $$ select id from public.matters where code = 'Matter D' $$;
create function pg_temp.d() returns uuid language sql as $$
  select id from public.drafts where matter_id = pg_temp.m() order by created_at desc, id limit 1 $$;

grant execute on all functions in schema pg_temp to authenticated;

-- a = principal, b = paralegal, c = docketing, e = administrator
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000e');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal'),
  ('00000000-0000-0000-0000-00000000000c', 'Test Docketing', 'docketing'),
  ('00000000-0000-0000-0000-00000000000e', 'Test Administrator', 'administrator');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.matters (code, summary, matter_type) values ('Matter D', 'Synthetic drafts test', 'petition');

-- D21: off by default, and only the principal turns it on.
select pg_temp.expect_error($$select public.draft_start_check(pg_temp.m(), 'cover_letter')$$, '23514');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$update public.settings set value = 'true' where key = 'drafting.enabled'$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.settings set value = 'true' where key = 'drafting.enabled';

-- The attorney approves the template first; staff can't change or approve one.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.draft_start_check(pg_temp.m(), 'cover_letter')$$, '23514');
select pg_temp.expect_error($$update public.draft_templates set attorney_approved = true where kind = 'cover_letter'$$, '42501');
select pg_temp.expect_error($$update public.draft_templates set body = 'New' where kind = 'cover_letter'$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.draft_templates set attorney_approved = true where kind = 'cover_letter';

-- New wording needs a new approval, and raises the version.
update public.draft_templates set body = 'Dear [CLIENT NAME]: [ITEM LIST]' where kind = 'cover_letter';
do $$ begin
  assert (select not attorney_approved and version = 2 and approved_by is null from public.draft_templates where kind = 'cover_letter'), 'new wording resets approval';
end $$;
update public.draft_templates set attorney_approved = true where kind = 'cover_letter';

-- Who can make a draft.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select public.create_draft(pg_temp.m(), 'cover_letter', null, 'Text', 'test')$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$select public.create_draft(pg_temp.m(), 'cover_letter', null, 'Text', 'test')$$, '42501');

-- Staff have no direct way to write a draft or skip the attorney.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$insert into public.drafts (matter_id, kind, template_version, body, original_body, model, status)
  values (pg_temp.m(), 'cover_letter', 2, 'Text', 'Text', 'test', 'approved')$$, '42501');

-- Personal data is refused.
select pg_temp.expect_error($$select public.create_draft(pg_temp.m(), 'cover_letter', null, 'Client A123456789', 'test')$$, '23514');
select pg_temp.expect_error($$select public.create_draft(pg_temp.m(), 'cover_letter', null, 'Receipt ABC1234567890', 'test')$$, '23514');
select pg_temp.expect_error($$select public.create_draft(pg_temp.m(), 'cover_letter', null, 'SSN 123-45-6789', 'test')$$, '23514');

-- A draft waits for the attorney, and is logged with who asked.
select public.create_draft(pg_temp.m(), 'cover_letter', null, 'Dear [CLIENT NAME]', 'test-model');
do $$ begin
  assert (select status = 'pending_review' and requested_by = '00000000-0000-0000-0000-00000000000b' and template_version = 2
          from public.drafts where id = pg_temp.d()), 'a new draft waits for review';
  assert exists (select 1 from public.event_log e where e.event_type = 'draft.created' and e.matter_id = pg_temp.m()), 'the draft is logged';
end $$;
select pg_temp.expect_error($$select public.review_draft(pg_temp.d(), 'approved')$$, '42501');
select pg_temp.expect_error($$update public.drafts set status = 'approved' where id = pg_temp.d()$$, '42501');

-- Sending back needs a note; an edit returns to the attorney, with the old text in the log.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.review_draft(pg_temp.d(), 'changes_requested')$$, '23514');
select public.review_draft(pg_temp.d(), 'changes_requested', 'Shorter, please');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.edit_draft(pg_temp.d(), 'Dear [CLIENT NAME], shorter');
do $$ begin
  assert (select status = 'pending_review' and original_body = 'Dear [CLIENT NAME]' from public.drafts where id = pg_temp.d()), 'an edit goes back for review and keeps the first text';
  assert exists (select 1 from public.event_log e where e.event_type = 'draft.updated'
                 and e.payload -> 'old' ->> 'body' = 'Dear [CLIENT NAME]'), 'the old text is in the log';
end $$;

-- Approval is logged with the attorney's name, and freezes the draft.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.review_draft(pg_temp.d(), 'approved');
do $$ begin
  assert (select status = 'approved' and reviewed_by = '00000000-0000-0000-0000-00000000000a' and reviewed_at is not null
          from public.drafts where id = pg_temp.d()), 'approval records who and when';
  assert exists (select 1 from jsonb_array_elements(public.matter_page(pg_temp.m()) -> 'drafts') x where x ->> 'status' = 'approved'), 'the matter page lists drafts';
end $$;
select pg_temp.expect_error($$select public.edit_draft(pg_temp.d(), 'Changed')$$, '23514');
select pg_temp.expect_error($$select public.review_draft(pg_temp.d(), 'rejected', 'No')$$, '23514');

-- The attorney's list shows drafts waiting, and only those.
select public.create_draft(pg_temp.m(), 'cover_letter', null, 'Second', 'test-model');
do $$ begin
  assert jsonb_array_length(public.dashboard_data() -> 'letter_drafts') = 1, 'one draft is waiting';
end $$;

-- Nothing is deleted.
reset role;
select pg_temp.expect_error($$delete from public.drafts$$, '42501');
select pg_temp.expect_error($$delete from public.draft_templates$$, '42501');

select 'DRAFTS TESTS PASSED';
rollback;
