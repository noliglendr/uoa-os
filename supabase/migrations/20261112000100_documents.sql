-- Increment 2: client document collection (docs/increment2-plan.md; D13-D16,
-- decision #31). Synthetic files only until D17.
--   * Staff create a request: checklist items the client (or a third party)
--     must send, a due date, and one secure upload link (14 days). The link
--     and a 6-digit code are shown to staff once; staff send the link and give
--     the code by another channel (phone or text). UOA OS keeps no client
--     contact details (R5) and stores only hashes of the link and the code.
--   * The client opens the link, enters the code, and uploads PDF, JPG, PNG or
--     HEIC files (25 MB each). Five wrong codes lock the link.
--   * Files sit in a private storage bucket (only the server reaches it). The
--     workflow tables keep the item, the status and a file reference only.
--   * Attorney, principal and paralegal open files and accept or reject them
--     (D16). Docketing and intake see the status, not the file. Every request,
--     upload, download, acceptance and rejection is logged.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description, decision) values
  ('documents.link_days', '14', 'A client upload link works for this many days, unless staff cancel it.', 'D14'),
  ('documents.overdue_days', '7',
   'A requested document is flagged on "My work" this many days after the request''s due date.', null);

-- ---------------------------------------------------------------------------
-- The request email template (D15): the attorney approves it once.
-- ---------------------------------------------------------------------------
alter table public.message_templates drop constraint message_templates_kind_check;
alter table public.message_templates add constraint message_templates_kind_check
  check (kind in ('receipt_update', 'appointment_update', 'engagement_followup', 'documents_followup', 'documents_request'));

insert into public.message_templates (kind, label, body) values
  ('documents_request', 'Request: upload documents', $t$Dear [CLIENT NAME]:

To continue work on your matter, please send us these documents:

[ITEM LIST]

Please upload them through this secure link by [DUE DATE]:

[UPLOAD LINK]

To open the link you need a 6-digit code. We will give you the code separately, by phone or text message. The link works until [LINK EXPIRES]. You can upload PDF, JPG, PNG or HEIC files of up to 25 MB each.

If a document is not available, please tell us, so that the attorney can advise you.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.doc_requests (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references public.matters (id),
  -- Who it is for, by role label only (e.g. "Beneficiary").
  party_id       uuid references public.parties (id),
  due_date       date not null,
  expires_at     timestamptz not null,
  status         text not null default 'open' check (status in ('open', 'cancelled', 'locked')),
  created_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  last_opened_at timestamptz,
  cancel_reason  text,
  cancelled_by   uuid references public.profiles (id),
  cancelled_at   timestamptz,
  updated_at     timestamptz not null default now(),
  constraint doc_requests_cancelled check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);

comment on table public.doc_requests is
  'Client document requests (Increment 2). One secure upload link each; the link and code themselves are never stored (doc_request_secrets holds hashes).';
create index doc_requests_matter_idx on public.doc_requests (matter_id);

create table public.doc_request_items (
  request_id uuid not null references public.doc_requests (id),
  item_id    uuid not null references public.checklist_items (id),
  primary key (request_id, item_id)
);

-- Server only: hashes of the link and code, wrong-code count, and the client's
-- short session after the code. Staff can't read this table.
create table public.doc_request_secrets (
  request_id         uuid primary key references public.doc_requests (id),
  token_hash         text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  code_hash          text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  failed_codes       integer not null default 0,
  session_hash       text check (session_hash ~ '^[0-9a-f]{64}$'),
  session_expires_at timestamptz
);

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references public.matters (id),
  item_id       uuid not null references public.checklist_items (id),
  request_id    uuid references public.doc_requests (id),
  -- Path in the private "client-documents" bucket. The file is renamed on
  -- upload, so the client's own file name (often a person's name) is never kept.
  storage_path  text not null unique,
  mime          text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 26214400),
  source        text not null default 'client' check (source in ('client', 'staff')),
  uploaded_by   uuid references public.profiles (id),
  status        text not null default 'received' check (status in ('received', 'accepted', 'rejected')),
  reject_reason text,
  reviewed_by   uuid references public.profiles (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint documents_rejected check ((status = 'rejected') = (reject_reason is not null))
);

comment on table public.documents is
  'Uploaded documents (metadata only; the files are in the private storage bucket). Synthetic files only until D17.';
create index documents_matter_idx on public.documents (matter_id);
create index documents_item_idx on public.documents (item_id);

-- Private storage bucket. No storage policies: only the server (service role)
-- reads or writes files, after the checks below. Skipped where Supabase
-- Storage is not installed (local test databases).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('client-documents', 'client-documents', false, 26214400,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'])
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Staff rules
-- ---------------------------------------------------------------------------
create function public.documents_role_check()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(public.current_app_role()::text, '') not in ('principal', 'attorney', 'paralegal') then
    raise exception 'Only the attorney, principal or paralegal can work with client documents'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Staff create a request. The server makes the link and code and passes only their hashes.
create function public.create_doc_request(p_matter uuid, p_party uuid, p_items uuid[], p_due date,
                                          p_token_hash text, p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_days integer := coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'documents.link_days'), 14);
  v_labels text[];
begin
  perform public.documents_role_check();
  perform public.draft_matter_open_check(p_matter);
  if not exists (select 1 from public.message_templates t where t.kind = 'documents_request' and t.attorney_approved) then
    raise exception 'The attorney must approve the "Request: upload documents" template first (Templates page)'
      using errcode = 'check_violation';
  end if;
  if coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'Choose at least one item to request' using errcode = 'check_violation';
  end if;
  select array_agg(i.label order by i.created_at) into v_labels
  from public.checklist_items i
  where i.id = any (p_items) and i.matter_id = p_matter and i.voided_at is null
    and i.owner in ('client', 'third_party') and i.status in ('needed', 'requested');
  if coalesce(cardinality(v_labels), 0) <> (select count(distinct x) from unnest(p_items) x) then
    raise exception 'Only open client or third-party items of this matter can be requested' using errcode = 'check_violation';
  end if;
  if p_due is null or p_due < current_date then
    raise exception 'Choose a due date from today on' using errcode = 'check_violation';
  end if;
  if p_party is not null and not exists (
       select 1 from public.parties p where p.id = p_party and p.matter_id = p_matter and p.voided_at is null) then
    raise exception 'That party is not on this matter' using errcode = 'check_violation';
  end if;

  insert into public.doc_requests (matter_id, party_id, due_date, expires_at)
  values (p_matter, p_party, p_due, now() + make_interval(days => v_days))
  returning id into v_id;
  insert into public.doc_request_items (request_id, item_id) select distinct v_id, x from unnest(p_items) x;
  insert into public.doc_request_secrets (request_id, token_hash, code_hash) values (v_id, p_token_hash, p_code_hash);
  update public.checklist_items set status = 'requested' where id = any (p_items) and status = 'needed';
  perform public.log_event('document_request.items', 'document_request', v_id::text, p_matter,
    jsonb_build_object('items', to_jsonb(v_labels), 'due_date', p_due));
  return v_id;
end;
$$;

create function public.cancel_doc_request(p_request uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.documents_role_check();
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Write a short note saying why' using errcode = 'check_violation';
  end if;
  update public.doc_requests
  set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where id = p_request and status <> 'cancelled';
  if not found then
    raise exception 'This link was already cancelled' using errcode = 'check_violation';
  end if;
  update public.doc_request_secrets set session_hash = null, session_expires_at = null where request_id = p_request;
end;
$$;

-- Accept or reject an upload. A rejected item goes back to "requested" unless
-- another file for it is still good.
create function public.review_document(p_document uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
begin
  perform public.documents_role_check();
  select * into d from public.documents where id = p_document for update;
  if not found then
    raise exception 'Document not found' using errcode = 'no_data_found';
  end if;
  perform public.draft_matter_open_check(d.matter_id);
  if d.status <> 'received' then
    raise exception 'This document was already reviewed' using errcode = 'check_violation';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Choose accept or reject' using errcode = 'check_violation';
  end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Write a short note saying why (the client is told)' using errcode = 'check_violation';
  end if;
  update public.documents
  set status = p_decision, reject_reason = case when p_decision = 'rejected' then trim(p_reason) end,
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_document;
  if p_decision = 'rejected' and not exists (
       select 1 from public.documents x where x.item_id = d.item_id and x.status in ('received', 'accepted')) then
    update public.checklist_items set status = 'requested' where id = d.item_id and status in ('received', 'drafted');
  end if;
end;
$$;

-- Opening a file: who may, and a log line. Returns the storage path for the server.
create function public.document_access(p_document uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
begin
  perform public.documents_role_check();
  select * into d from public.documents where id = p_document;
  if not found then
    raise exception 'Document not found' using errcode = 'no_data_found';
  end if;
  perform public.log_event('document.downloaded', 'document', d.id::text, d.matter_id, '{}'::jsonb);
  return d.storage_path;
end;
$$;

-- Every file of a matter, for one ZIP download (the firm owns its files).
create function public.documents_zip_access(p_matter uuid)
returns table (id uuid, storage_path text, label text, mime text, created_at timestamptz, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.documents_role_check();
  perform public.log_event('documents.downloaded_zip', 'matter', p_matter::text, p_matter,
    jsonb_build_object('files', (select count(*) from public.documents x where x.matter_id = p_matter)));
  return query
    select x.id, x.storage_path, i.label, x.mime, x.created_at, x.status
    from public.documents x join public.checklist_items i on i.id = x.item_id
    where x.matter_id = p_matter
    order by i.created_at, x.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- The client's side (server only: called with the service role after the
-- server has hashed the link, code and session). Client steps are system
-- events (no staff actor).
-- ---------------------------------------------------------------------------

-- open | expired | cancelled | locked | closed | not_found
create function public.doc_link_state(p_token_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when r.status = 'cancelled' then 'cancelled'
      when r.status = 'locked' then 'locked'
      when m.status not in ('prospect', 'active') then 'closed'
      when r.expires_at <= now() then 'expired'
      else 'open' end
    from public.doc_request_secrets s
    join public.doc_requests r on r.id = s.request_id
    join public.matters m on m.id = r.matter_id
    where s.token_hash = p_token_hash), 'not_found');
$$;

-- ok | wrong | locked | (another state from doc_link_state)
create function public.doc_verify_code(p_token_hash text, p_code_hash text, p_session_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.doc_request_secrets;
  v_state text := public.doc_link_state(p_token_hash);
  v_matter uuid;
begin
  if v_state <> 'open' then
    return v_state;
  end if;
  select * into s from public.doc_request_secrets where token_hash = p_token_hash for update;
  select r.matter_id into v_matter from public.doc_requests r where r.id = s.request_id;
  if s.code_hash <> p_code_hash then
    update public.doc_request_secrets set failed_codes = failed_codes + 1 where request_id = s.request_id;
    if s.failed_codes + 1 >= 5 then
      update public.doc_requests set status = 'locked', updated_at = now() where id = s.request_id;
      return 'locked';
    end if;
    return 'wrong';
  end if;
  update public.doc_request_secrets
  set failed_codes = 0, session_hash = p_session_hash, session_expires_at = now() + interval '2 hours'
  where request_id = s.request_id;
  update public.doc_requests set last_opened_at = now(), updated_at = now() where id = s.request_id;
  return 'ok';
end;
$$;

-- The request behind a valid client session, with its items and uploads; null otherwise.
create function public.doc_session(p_token_hash text, p_session_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'request_id', r.id, 'matter_id', r.matter_id, 'due_date', r.due_date, 'expires_at', r.expires_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'label', i.label,
               'uploads', coalesce((
                 select jsonb_agg(jsonb_build_object('status', x.status, 'reject_reason', x.reject_reason, 'created_at', x.created_at)
                                  order by x.created_at)
                 from public.documents x where x.item_id = i.id and x.request_id = r.id), '[]'::jsonb))
             order by i.created_at, i.label)
      from public.doc_request_items ri join public.checklist_items i on i.id = ri.item_id
      where ri.request_id = r.id and i.voided_at is null), '[]'::jsonb))
  from public.doc_request_secrets s
  join public.doc_requests r on r.id = s.request_id
  where s.token_hash = p_token_hash and s.session_hash = p_session_hash and s.session_expires_at > now()
    and public.doc_link_state(p_token_hash) = 'open';
$$;

create function public.record_client_upload(p_token_hash text, p_session_hash text, p_item uuid, p_path text,
                                            p_mime text, p_size integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session jsonb := public.doc_session(p_token_hash, p_session_hash);
  v_request uuid := (v_session ->> 'request_id')::uuid;
  v_matter uuid := (v_session ->> 'matter_id')::uuid;
  v_id uuid;
begin
  if v_session is null then
    raise exception 'The upload link is no longer open' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_session -> 'items') e where (e ->> 'id')::uuid = p_item) then
    raise exception 'That item is not part of this request' using errcode = 'check_violation';
  end if;
  if p_path not like v_matter || '/' || v_request || '/%' then
    raise exception 'Wrong file location' using errcode = 'check_violation';
  end if;
  insert into public.documents (matter_id, item_id, request_id, storage_path, mime, size_bytes, source)
  values (v_matter, p_item, v_request, p_path, p_mime, p_size, 'client')
  returning id into v_id;
  -- Received; a third-party draft is "drafted" and still waits for the attorney (redline 12).
  update public.checklist_items
  set status = case when third_party_draft then 'drafted' else 'received' end::public.checklist_status
  where id = p_item and status in ('needed', 'requested');
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Log, no deletes, access
-- ---------------------------------------------------------------------------
create trigger doc_requests_log after insert or update on public.doc_requests
  for each row execute function public.log_row_change('document_request');
create trigger documents_log after insert or update on public.documents
  for each row execute function public.log_row_change('document');

do $$
declare t text;
begin
  foreach t in array array['doc_requests', 'doc_request_items', 'doc_request_secrets', 'documents'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.block_delete()',
                   t || '_no_delete', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.block_delete()',
                   t || '_no_truncate', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
  end loop;
  foreach t in array array['doc_requests', 'doc_request_items', 'documents'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.current_app_role()) is not null)',
                   t || '_select', t);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'documents_role_check()', 'doc_link_state(text)', 'doc_verify_code(text, text, text)', 'doc_session(text, text)',
    'record_client_upload(text, text, uuid, text, text, integer)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'doc_link_state(text)', 'doc_verify_code(text, text, text)', 'doc_session(text, text)',
    'record_client_upload(text, text, uuid, text, text, integer)'] loop
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array[
    'create_doc_request(uuid, uuid, uuid[], date, text, text)', 'cancel_doc_request(uuid, text)',
    'review_document(uuid, text, text)', 'document_access(uuid)', 'documents_zip_access(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
