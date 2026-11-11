-- Client document collection (Increment 2; decision #31). Synthetic data only.
-- Runs in a transaction and rolls back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/documents.test.sql

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

create function pg_temp.h(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create function pg_temp.m() returns uuid language sql as $$ select id from public.matters where code = 'Matter J' $$;
create function pg_temp.item(p_label text) returns uuid language sql as $$ select id from public.checklist_items where label = p_label $$;
create function pg_temp.req() returns uuid language sql as $$ select id from public.doc_requests order by created_at desc, id limit 1 $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

-- a = principal, b = paralegal, c = docketing
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Principal', 'principal'),
  ('00000000-0000-0000-0000-00000000000b', 'Test Paralegal', 'paralegal'),
  ('00000000-0000-0000-0000-00000000000c', 'Test Docketing', 'docketing');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.matters (code, summary, matter_type) values ('Matter J', 'Synthetic documents test', 'petition');
insert into public.checklist_items (matter_id, label, owner, third_party_draft) values
  (pg_temp.m(), 'Passport copy', 'client', false),
  (pg_temp.m(), 'Employer letter', 'third_party', true),
  (pg_temp.m(), 'Firm cover sheet', 'firm', false);

-- The request template must be approved first.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.create_doc_request(pg_temp.m(), null, array[pg_temp.item('Passport copy')], current_date + 7, pg_temp.h('t1'), pg_temp.h('t1:123456'))$$, '23514');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.message_templates set attorney_approved = true where kind = 'documents_request';

-- Who can request, and what.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error($$select public.create_doc_request(pg_temp.m(), null, array[pg_temp.item('Passport copy')], current_date + 7, pg_temp.h('t1'), pg_temp.h('t1:123456'))$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.create_doc_request(pg_temp.m(), null, array[pg_temp.item('Firm cover sheet')], current_date + 7, pg_temp.h('t1'), pg_temp.h('t1:123456'))$$, '23514');
select pg_temp.expect_error($$select public.create_doc_request(pg_temp.m(), null, array[pg_temp.item('Passport copy')], current_date - 1, pg_temp.h('t1'), pg_temp.h('t1:123456'))$$, '23514');
select pg_temp.expect_error($$select public.create_doc_request(pg_temp.m(), null, array[]::uuid[], current_date + 7, pg_temp.h('t1'), pg_temp.h('t1:123456'))$$, '23514');
select public.create_doc_request(pg_temp.m(), null, array[pg_temp.item('Passport copy'), pg_temp.item('Employer letter')],
                                 current_date + 7, pg_temp.h('t1'), pg_temp.h('t1:123456'));
do $$ begin
  assert (select status from public.checklist_items where label = 'Passport copy') = 'requested', 'items become requested';
  assert (select expires_at::date from public.doc_requests) = current_date + 14, 'the link works 14 days';
  assert exists (select 1 from public.event_log where event_type = 'document_request.items'), 'the request is logged with its items';
end $$;

-- Staff never see the link or code hashes, and can't call the client functions.
select pg_temp.expect_error($$select * from public.doc_request_secrets$$, '42501');
select pg_temp.expect_error($$select public.doc_session(pg_temp.h('t1'), pg_temp.h('s1'))$$, '42501');
select pg_temp.expect_error($$insert into public.documents (matter_id, item_id, storage_path, mime, size_bytes) values (pg_temp.m(), pg_temp.item('Passport copy'), 'x', 'application/pdf', 1)$$, '42501');

-- The client: a wrong code, then the right one opens a session.
reset role;
set local role service_role;
do $$ begin
  assert public.doc_link_state(pg_temp.h('nope')) = 'not_found', 'unknown link';
  assert public.doc_link_state(pg_temp.h('t1')) = 'open', 'link open';
  assert public.doc_verify_code(pg_temp.h('t1'), pg_temp.h('t1:000000'), pg_temp.h('s1')) = 'wrong', 'wrong code';
  assert public.doc_session(pg_temp.h('t1'), pg_temp.h('s1')) is null, 'no session after a wrong code';
  assert public.doc_verify_code(pg_temp.h('t1'), pg_temp.h('t1:123456'), pg_temp.h('s1')) = 'ok', 'right code';
  assert jsonb_array_length(public.doc_session(pg_temp.h('t1'), pg_temp.h('s1')) -> 'items') = 2, 'the client sees the two items';
  assert public.doc_session(pg_temp.h('t1'), pg_temp.h('other')) is null, 'another session gets nothing';
end $$;

-- Uploads: only into this request's folder, only its items.
select pg_temp.expect_error($$select public.record_client_upload(pg_temp.h('t1'), pg_temp.h('s1'), pg_temp.item('Firm cover sheet'), pg_temp.m() || '/' || pg_temp.req() || '/a.pdf', 'application/pdf', 1000)$$, '23514');
select pg_temp.expect_error($$select public.record_client_upload(pg_temp.h('t1'), pg_temp.h('s1'), pg_temp.item('Passport copy'), 'elsewhere/a.pdf', 'application/pdf', 1000)$$, '23514');
select pg_temp.expect_error($$select public.record_client_upload(pg_temp.h('t1'), pg_temp.h('bad'), pg_temp.item('Passport copy'), pg_temp.m() || '/' || pg_temp.req() || '/a.pdf', 'application/pdf', 1000)$$, '42501');
select public.record_client_upload(pg_temp.h('t1'), pg_temp.h('s1'), pg_temp.item('Passport copy'), pg_temp.m() || '/' || pg_temp.req() || '/a.pdf', 'application/pdf', 1000);
select public.record_client_upload(pg_temp.h('t1'), pg_temp.h('s1'), pg_temp.item('Employer letter'), pg_temp.m() || '/' || pg_temp.req() || '/b.png', 'image/png', 2000);
do $$ begin
  assert (select status from public.checklist_items where label = 'Passport copy') = 'received', 'upload marks the item received';
  assert (select status from public.checklist_items where label = 'Employer letter') = 'drafted', 'a third-party draft still waits for the attorney';
  assert (select uploaded_by is null and source = 'client' from public.documents where mime = 'application/pdf'), 'client uploads are system events';
end $$;

-- Staff review. Docketing sees the status but can't open or review files.
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from public.documents) = 2, 'docketing sees the documents list';
end $$;
select pg_temp.expect_error($$select public.document_access((select id from public.documents where mime = 'application/pdf'))$$, '42501');
select pg_temp.expect_error($$select public.review_document((select id from public.documents where mime = 'application/pdf'), 'accepted')$$, '42501');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert public.document_access((select id from public.documents where mime = 'application/pdf')) like '%/a.pdf', 'paralegal opens the file';
  assert exists (select 1 from public.event_log where event_type = 'document.downloaded'), 'opening a file is logged';
  assert (select count(*) from public.documents_zip_access(pg_temp.m())) = 2, 'every file for the ZIP';
end $$;
select pg_temp.expect_error($$select public.review_document((select id from public.documents where mime = 'application/pdf'), 'rejected', ' ')$$, '23514');
select public.review_document((select id from public.documents where mime = 'application/pdf'), 'rejected', 'Page 2 is missing');
select pg_temp.expect_error($$select public.review_document((select id from public.documents where mime = 'application/pdf'), 'accepted')$$, '23514');
do $$ begin
  assert (select status from public.checklist_items where label = 'Passport copy') = 'requested', 'a rejected file reopens the item';
end $$;
select public.review_document((select id from public.documents where mime = 'image/png'), 'accepted');

-- The client sees the rejection reason; a cancelled link stops working.
reset role;
set local role service_role;
do $$ begin
  assert (select e #>> '{uploads,0,reject_reason}' from jsonb_array_elements(public.doc_session(pg_temp.h('t1'), pg_temp.h('s1')) -> 'items') e
          where e ->> 'label' = 'Passport copy') = 'Page 2 is missing', 'client sees why';
end $$;
reset role;
set local role authenticated;
select pg_temp.expect_error($$select public.cancel_doc_request(pg_temp.req(), '')$$, '23514');
select public.cancel_doc_request(pg_temp.req(), 'Client sent them by mail');
reset role;
set local role service_role;
do $$ begin
  assert public.doc_link_state(pg_temp.h('t1')) = 'cancelled', 'cancelled link';
  assert public.doc_session(pg_temp.h('t1'), pg_temp.h('s1')) is null, 'session ends with the link';
end $$;

-- Five wrong codes lock a link.
reset role;
set local role authenticated;
select public.create_doc_request(pg_temp.m(), null, array[pg_temp.item('Passport copy')], current_date, pg_temp.h('t2'), pg_temp.h('t2:111111'));
reset role;
set local role service_role;
do $$
declare i int;
begin
  for i in 1..4 loop
    assert public.doc_verify_code(pg_temp.h('t2'), pg_temp.h('t2:999999'), pg_temp.h('s2')) = 'wrong', 'wrong ' || i;
  end loop;
  assert public.doc_verify_code(pg_temp.h('t2'), pg_temp.h('t2:999999'), pg_temp.h('s2')) = 'locked', 'locked on the fifth';
  assert public.doc_verify_code(pg_temp.h('t2'), pg_temp.h('t2:111111'), pg_temp.h('s2')) = 'locked', 'even the right code is refused';
end $$;

reset role;
select pg_temp.expect_error($$delete from public.documents$$, '42501');
select pg_temp.expect_error($$delete from public.doc_requests$$, '42501');

select 'DOCUMENTS TESTS PASSED';
rollback;
