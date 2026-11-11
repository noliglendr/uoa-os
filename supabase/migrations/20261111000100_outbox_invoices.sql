-- Increment 4, Steps 2-4 (docs/increment4-plan.md, decision #29).
-- UOA OS notices and prepares; a person checks and sends. Nothing here sends
-- anything to a client or to a billing tool.
--   Step 2: client updates (receipt arrived; biometrics or interview scheduled)
--           are prepared from an attorney-approved template and wait in the Outbox.
--   Step 3: client follow-ups (engagement not signed; documents still missing)
--           are prepared by the daily job, also into the Outbox.
--   Step 4: reaching a fee phase (fee schedule, D23) prepares an invoice draft;
--           the attorney sets the amount and approves; staff record the
--           billing tool's reference (D22) once it is entered there.
-- Decisions are never in the Outbox: the attorney tells the client (rule).
-- No client details (rule R5): messages keep [CLIENT NAME] as a blank, filled
-- in when staff send it outside UOA OS. Invoices carry the matter code only.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description, decision) values
  ('client_followup.engagement_days', '7',
   'Prepare a reminder to sign the engagement agreement after a matter waits this many days at stage 2, and again every this many days.', null),
  ('client_followup.documents_days', '7',
   'Prepare a reminder for documents requested from the client this many days ago and not yet received, and again every this many days.', null),
  ('billing.invoice_drafts', 'true',
   'Prepare an invoice draft when a matter reaches a fee phase (fee schedule on the Invoices page). The attorney approves every invoice; the billing tool sends it.', 'D23');

-- ---------------------------------------------------------------------------
-- Client message templates (the attorney approves each one)
-- ---------------------------------------------------------------------------
create table public.message_templates (
  kind              text primary key
                    check (kind in ('receipt_update', 'appointment_update', 'engagement_followup', 'documents_followup')),
  label             text not null,
  body              text not null check (length(trim(body)) > 0),
  version           integer not null default 1,
  attorney_approved boolean not null default false,
  approved_by       uuid references public.profiles (id),
  approved_at       timestamptz,
  updated_at        timestamptz not null default now()
);

comment on table public.message_templates is
  'Client message templates. Nothing is prepared from a template until the attorney approves it. Decisions have no template: the attorney tells the client.';

insert into public.message_templates (kind, label, body) values
  ('receipt_update', 'Update: receipt arrived', $t$Dear [CLIENT NAME]:

We received the receipt notice for your [FORM TYPE] filing. This confirms that the government has your filing. You do not need to do anything now. We will contact you when there is news.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$),
  ('appointment_update', 'Update: appointment scheduled', $t$Dear [CLIENT NAME]:

Your [APPOINTMENT TYPE] appointment is scheduled for [APPOINTMENT DATE]. Please attend in person and bring the appointment notice and your photo identification. Our office will contact you to prepare.

If you cannot attend, tell us right away so that we can ask to reschedule.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$),
  ('engagement_followup', 'Follow-up: engagement not signed', $t$Dear [CLIENT NAME]:

We sent you our engagement agreement, and we have not yet received it signed. We can begin work on your matter once it is signed. Please contact our office if you have any questions about it.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$),
  ('documents_followup', 'Follow-up: documents still needed', $t$Dear [CLIENT NAME]:

This is a reminder that we still need these documents to continue work on your matter:

[ITEM LIST]

Please send them as soon as you can. If a document is not available, please tell us, so that the attorney can advise you.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$);

-- Only the attorney changes or approves a template. New wording needs a new approval.
create function public.message_templates_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    perform public.require_attorney('change a client message template');
    perform public.draft_personal_data_check(new.body);
    new.version := old.version + 1;
    new.attorney_approved := false;
    new.approved_by := null;
    new.approved_at := null;
  elsif new.attorney_approved is distinct from old.attorney_approved then
    perform public.require_attorney('approve a client message template');
    new.approved_by := case when new.attorney_approved then auth.uid() end;
    new.approved_at := case when new.attorney_approved then now() end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger message_templates_rule before update on public.message_templates
  for each row execute function public.message_templates_rule();

-- ---------------------------------------------------------------------------
-- Outbox: client messages prepared by UOA OS, sent by staff
-- ---------------------------------------------------------------------------
create table public.client_messages (
  id               uuid primary key default gen_random_uuid(),
  matter_id        uuid not null references public.matters (id),
  kind             text not null references public.message_templates (kind),
  template_version integer not null,
  -- One message per event (e.g. receipt:<filing id>), so nothing is prepared twice.
  item_key         text not null unique,
  filing_id        uuid references public.filings (id),
  deadline_id      uuid references public.deadlines (id),
  body             text not null check (length(trim(body)) > 0),
  status           text not null default 'waiting' check (status in ('waiting', 'sent', 'cancelled')),
  sent_via         text check (sent_via in ('email', 'phone', 'mail', 'portal', 'in_person')),
  sent_by          uuid references public.profiles (id),
  sent_at          timestamptz,
  cancel_reason    text,
  cancelled_by     uuid references public.profiles (id),
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint client_messages_sent check ((status = 'sent') = (sent_at is not null and sent_via is not null)),
  constraint client_messages_cancelled check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);

comment on table public.client_messages is
  'Outbox (Increment 4, Steps 2-3). Prepared by UOA OS; staff send each one outside UOA OS and mark it sent (D11: nothing sends by itself). [CLIENT NAME] stays a blank (rule R5).';
create index client_messages_waiting_idx on public.client_messages (created_at) where status = 'waiting';
create index client_messages_matter_idx on public.client_messages (matter_id, kind, created_at);

-- Sent and cancelled messages stay as they are.
create function public.client_messages_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'waiting' then
    raise exception 'This message was already %, so it can no longer change', old.status using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger client_messages_frozen before update on public.client_messages
  for each row execute function public.client_messages_frozen();

-- Form names only ("I-130"); other free text stays out of client messages.
create function public.form_name_or(p_form text, p_else text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_form ~ '^[A-Z]{1,4}-[0-9]{1,4}[A-Z]?$' then p_form else p_else end;
$$;

create function public.firm_date_text(p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_date, 'FMMonth FMDD, YYYY');
$$;

-- Prepares one message from its template, if the attorney approved it and the
-- matter is open. UOA OS fills [DATE], [ATTORNEY NAME] and the given blanks;
-- [CLIENT NAME] stays for staff. Returns null when nothing was prepared.
create function public.queue_client_message(p_matter uuid, p_kind text, p_key text, p_filing uuid, p_deadline uuid, p_fill jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.message_templates;
  v_attorney text;
  v_body text;
  v_id uuid;
  k text;
begin
  select * into t from public.message_templates where kind = p_kind;
  if not found or not t.attorney_approved then
    return null;
  end if;
  select p.display_name into v_attorney
  from public.matters m join public.profiles p on p.id = m.attorney_id
  where m.id = p_matter and m.status in ('prospect', 'active');
  if not found then
    return null;
  end if;
  v_body := replace(t.body, '[DATE]', public.firm_date_text((now() at time zone 'America/Chicago')::date));
  if coalesce(trim(v_attorney), '') <> '' then
    v_body := replace(v_body, '[ATTORNEY NAME]', trim(v_attorney));
  end if;
  for k in select jsonb_object_keys(coalesce(p_fill, '{}'::jsonb)) loop
    v_body := replace(v_body, '[' || k || ']', coalesce(p_fill ->> k, '[' || k || ']'));
  end loop;
  insert into public.client_messages (matter_id, kind, template_version, item_key, filing_id, deadline_id, body)
  values (p_matter, p_kind, t.version, p_key, p_filing, p_deadline, v_body)
  on conflict (item_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Step 2a: a logged receipt prepares "receipt arrived". A filing entered in
-- error cancels its waiting messages.
create function public.client_updates_on_filing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.voided_at is not null then
    update public.client_messages
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'The filing was entered in error'
    where filing_id = new.id and status = 'waiting';
    return null;
  end if;
  if new.receipt_logged_at is not null and (tg_op = 'INSERT' or old.receipt_logged_at is null) then
    perform public.queue_client_message(new.matter_id, 'receipt_update', 'receipt:' || new.id, new.id, null,
      jsonb_build_object('FORM TYPE', public.form_name_or(new.form_type, 'immigration')));
  end if;
  return null;
end;
$$;

create trigger filings_client_updates after insert or update of receipt_logged_at, voided_at on public.filings
  for each row execute function public.client_updates_on_filing();

-- Step 2b: a biometrics or interview appointment prepares "appointment
-- scheduled". A new date prepares a new message and cancels the old one.
-- Hearings go to the attorney (redline 8), so they have no automatic update.
create function public.client_updates_on_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.notice_type;
begin
  if new.kind <> 'appointment' then
    return null;
  end if;
  if tg_op = 'UPDATE' and (new.due_date is distinct from old.due_date or new.status <> 'open' or new.voided_at is not null) then
    update public.client_messages
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
        cancel_reason = case when new.status <> 'open' or new.voided_at is not null then 'The appointment is no longer open'
                             else 'The appointment date changed' end
    where deadline_id = new.id and status = 'waiting';
  end if;
  if new.status = 'open' and new.voided_at is null and new.notice_id is not null
     and (tg_op = 'INSERT' or new.due_date is distinct from old.due_date) then
    select n.notice_type into v_type from public.notices n where n.id = new.notice_id;
    if v_type in ('biometrics', 'interview') then
      perform public.queue_client_message(new.matter_id, 'appointment_update', 'appointment:' || new.id || ':' || new.due_date,
        new.filing_id, new.id,
        jsonb_build_object('APPOINTMENT TYPE', v_type::text, 'APPOINTMENT DATE', public.firm_date_text(new.due_date)));
    end if;
  end if;
  return null;
end;
$$;

create trigger deadlines_client_updates after insert or update of due_date, status, voided_at on public.deadlines
  for each row execute function public.client_updates_on_deadline();

-- Step 3: client follow-ups, run by the daily job (service role, so these are
-- system events and never make a stalled matter look active). Also tidies up:
-- a waiting message that is no longer needed is cancelled.
create function public.queue_client_followups()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eng integer := coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'client_followup.engagement_days'), 7);
  v_doc integer := coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'client_followup.documents_days'), 7);
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_prepared integer := 0;
  v_cancelled integer := 0;
  r record;
begin
  with done as (
    update public.client_messages x
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'No longer needed (checked by UOA OS)'
    where x.status = 'waiting' and (
      not exists (select 1 from public.matters m where m.id = x.matter_id and m.status in ('prospect', 'active'))
      or (x.kind = 'engagement_followup' and exists (
            select 1 from public.gates g where g.matter_id = x.matter_id and g.stage = 2 and g.cycle_id is null))
      or (x.kind = 'documents_followup' and not exists (
            select 1 from public.checklist_items i
            where i.matter_id = x.matter_id and i.owner = 'client' and i.status = 'requested' and i.voided_at is null))
    )
    returning 1
  )
  select count(*) into v_cancelled from done;

  -- Engagement agreement not signed: the matter waits at stage 2.
  for r in
    select m.id from public.matters m
    where m.status = 'prospect' and m.stage = 2
      and m.stage_changed_at <= now() - make_interval(days => v_eng)
      and not exists (select 1 from public.gates g where g.matter_id = m.id and g.stage = 2 and g.cycle_id is null)
      and not exists (select 1 from public.client_messages x
                      where x.matter_id = m.id and x.kind = 'engagement_followup'
                        and (x.status = 'waiting' or x.created_at > now() - make_interval(days => v_eng)))
  loop
    if public.queue_client_message(r.id, 'engagement_followup', 'engagement:' || r.id || ':' || v_today, null, null, '{}'::jsonb) is not null then
      v_prepared := v_prepared + 1;
    end if;
  end loop;

  -- Documents requested from the client and not received.
  for r in
    select i.matter_id, string_agg('- ' || i.label, E'\n' order by i.created_at) as items
    from public.checklist_items i
    join public.matters m on m.id = i.matter_id and m.status in ('prospect', 'active')
    where i.owner = 'client' and i.status = 'requested' and i.voided_at is null
      and i.updated_at <= now() - make_interval(days => v_doc)
    group by i.matter_id
  loop
    if not exists (select 1 from public.client_messages x
                   where x.matter_id = r.matter_id and x.kind = 'documents_followup'
                     and (x.status = 'waiting' or x.created_at > now() - make_interval(days => v_doc)))
       and public.queue_client_message(r.matter_id, 'documents_followup', 'documents:' || r.matter_id || ':' || v_today,
                                       null, null, jsonb_build_object('ITEM LIST', r.items)) is not null then
      v_prepared := v_prepared + 1;
    end if;
  end loop;

  return jsonb_build_object('prepared', v_prepared, 'cancelled', v_cancelled);
end;
$$;

create function public.client_message_role_check()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(public.current_app_role()::text, '') not in ('principal', 'attorney', 'paralegal', 'docketing') then
    raise exception 'Only the attorney, principal, paralegal or docketing staff can send client messages'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Staff sent the message themselves (outside UOA OS) and record how.
create function public.mark_message_sent(p_message uuid, p_via text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.client_messages;
begin
  perform public.client_message_role_check();
  select * into x from public.client_messages where id = p_message for update;
  if not found then
    raise exception 'Message not found' using errcode = 'no_data_found';
  end if;
  if x.status <> 'waiting' then
    raise exception 'This message is not waiting to be sent' using errcode = 'check_violation';
  end if;
  perform public.draft_matter_open_check(x.matter_id);
  if not exists (select 1 from public.message_templates t where t.kind = x.kind and t.attorney_approved) then
    raise exception 'The attorney withdrew approval of this template, so it cannot be sent' using errcode = 'check_violation';
  end if;
  if coalesce(p_via, '') not in ('email', 'phone', 'mail', 'portal', 'in_person') then
    raise exception 'Choose how it was sent' using errcode = 'check_violation';
  end if;
  update public.client_messages set status = 'sent', sent_via = p_via, sent_by = auth.uid(), sent_at = now() where id = p_message;
end;
$$;

create function public.cancel_message(p_message uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.client_message_role_check();
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Write a short note saying why' using errcode = 'check_violation';
  end if;
  update public.client_messages
  set status = 'cancelled', cancel_reason = trim(p_reason), cancelled_by = auth.uid(), cancelled_at = now()
  where id = p_message and status = 'waiting';
  if not found then
    raise exception 'This message is not waiting to be sent' using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 4: fee schedule (D23) and invoice drafts
-- ---------------------------------------------------------------------------
create table public.fee_schedule (
  id           uuid primary key default gen_random_uuid(),
  matter_type  public.matter_type not null,
  -- The step that reaches the fee phase.
  trigger      text not null check (trigger in ('engagement', 'strategy', 'filing', 'response', 'decision', 'closure')),
  label        text not null check (length(trim(label)) > 0),
  -- Null: the attorney enters the amount on each invoice.
  amount_cents integer check (amount_cents > 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (matter_type, trigger, label)
);

comment on table public.fee_schedule is
  'Fee phases per matter type (D23). The principal changes them on the Invoices page; no developer needed.';

-- Starter phases with no amounts: Frank supplies the fees (D23).
insert into public.fee_schedule (matter_type, trigger, label)
select t, p.trigger, p.label
from unnest(enum_range(null::public.matter_type)) t
cross join (values ('engagement', 'Engagement fee'), ('filing', 'Filing phase fee')) p (trigger, label);

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  matter_id     uuid not null references public.matters (id),
  fee_phase_id  uuid not null references public.fee_schedule (id),
  label         text not null,
  -- The logged event that reached the fee phase.
  event_id      bigint not null, -- event_log.id (append-only, so no foreign key is needed)
  amount_cents  integer check (amount_cents > 0),
  status        text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'void')),
  note          text,
  approved_by   uuid references public.profiles (id),
  approved_at   timestamptz,
  billing_ref   text,
  sent_by       uuid references public.profiles (id),
  sent_at       timestamptz,
  void_reason   text,
  voided_by     uuid references public.profiles (id),
  voided_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, fee_phase_id),
  constraint invoices_amount check (status in ('draft', 'void') or amount_cents is not null),
  constraint invoices_approved check (status in ('draft', 'void') or approved_at is not null),
  constraint invoices_sent check (status <> 'sent' or sent_at is not null),
  constraint invoices_void check ((status = 'void') = (voided_at is not null))
);

comment on table public.invoices is
  'Invoice drafts (Increment 4, Step 4). The attorney approves each one; the billing tool (D22) sends and collects. Matter code only, no client details.';
create index invoices_open_idx on public.invoices (status) where status in ('draft', 'approved');
create index invoices_matter_idx on public.invoices (matter_id);

-- A fee phase is reached when its event is logged.
create function public.invoice_on_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trigger text;
begin
  if new.matter_id is null then
    return null;
  end if;
  v_trigger := case
    when new.event_type = 'engagement.signed' then 'engagement'
    when new.event_type = 'strategy.approved' then 'strategy'
    when new.event_type = 'filing.submitted' and new.entity_type = 'filing' then 'filing'
    when new.event_type = 'filing.submitted' and new.entity_type = 'response_cycle' then 'response'
    when new.event_type = 'decision.recorded' then 'decision'
    when new.event_type = 'matter.closed' then 'closure'
  end;
  if v_trigger is null
     or (select s.value from public.settings s where s.key = 'billing.invoice_drafts') is distinct from 'true'::jsonb then
    return null;
  end if;
  insert into public.invoices (matter_id, fee_phase_id, label, event_id, amount_cents)
  select new.matter_id, f.id, f.label, new.id, f.amount_cents
  from public.fee_schedule f
  join public.matters m on m.id = new.matter_id and m.matter_type = f.matter_type
  where f.active and f.trigger = v_trigger
  on conflict do nothing;
  return null;
end;
$$;

create trigger event_log_invoices after insert on public.event_log
  for each row execute function public.invoice_on_event();

create function public.require_principal(p_what text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.has_role(array['principal']::public.app_role[]) then
    raise exception 'Only the principal can %', p_what using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create function public.add_fee_phase(p_matter_type public.matter_type, p_trigger text, p_label text, p_amount_cents integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_staff();
  perform public.require_principal('change the fee schedule');
  insert into public.fee_schedule (matter_type, trigger, label, amount_cents)
  values (p_matter_type, p_trigger, trim(p_label), p_amount_cents)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.save_fee_phase(p_phase uuid, p_label text, p_amount_cents integer, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  perform public.require_principal('change the fee schedule');
  update public.fee_schedule
  set label = trim(p_label), amount_cents = p_amount_cents, active = p_active, updated_at = now()
  where id = p_phase;
  if not found then
    raise exception 'Fee phase not found' using errcode = 'no_data_found';
  end if;
end;
$$;

create function public.invoice_for_update(p_invoice uuid, p_status text[])
returns public.invoices
language plpgsql
set search_path = ''
as $$
declare
  v public.invoices;
begin
  select * into v from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'no_data_found';
  end if;
  if not v.status = any (p_status) then
    raise exception 'This invoice is %, so it cannot do that', v.status using errcode = 'check_violation';
  end if;
  return v;
end;
$$;

create function public.set_invoice_amount(p_invoice uuid, p_amount_cents integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  perform public.require_attorney('set an invoice amount');
  perform public.invoice_for_update(p_invoice, array['draft']);
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount above zero' using errcode = 'check_violation';
  end if;
  update public.invoices set amount_cents = p_amount_cents, note = nullif(trim(p_note), ''), updated_at = now() where id = p_invoice;
end;
$$;

create function public.approve_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices;
begin
  perform public.require_staff();
  perform public.require_attorney('approve an invoice');
  v := public.invoice_for_update(p_invoice, array['draft']);
  if v.amount_cents is null then
    raise exception 'Enter the amount before approving' using errcode = 'check_violation';
  end if;
  update public.invoices set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now() where id = p_invoice;
end;
$$;

-- Staff entered the approved invoice in the billing tool, which sends and collects.
create function public.record_invoice_sent(p_invoice uuid, p_billing_ref text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  if coalesce(public.current_app_role()::text, '') not in ('principal', 'attorney', 'administrator') then
    raise exception 'Only the attorney, principal or an administrator can record an invoice as sent' using errcode = 'insufficient_privilege';
  end if;
  perform public.invoice_for_update(p_invoice, array['approved']);
  if coalesce(trim(p_billing_ref), '') = '' then
    raise exception 'Enter the billing tool''s invoice number' using errcode = 'check_violation';
  end if;
  update public.invoices
  set status = 'sent', billing_ref = trim(p_billing_ref), sent_by = auth.uid(), sent_at = now(), updated_at = now()
  where id = p_invoice;
end;
$$;

create function public.void_invoice(p_invoice uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  perform public.require_attorney('void an invoice');
  perform public.invoice_for_update(p_invoice, array['draft', 'approved', 'sent']);
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Write a short note saying why' using errcode = 'check_violation';
  end if;
  update public.invoices
  set status = 'void', void_reason = trim(p_reason), voided_by = auth.uid(), voided_at = now(), updated_at = now()
  where id = p_invoice;
end;
$$;

-- ---------------------------------------------------------------------------
-- Log, no deletes, access
-- ---------------------------------------------------------------------------
create trigger client_messages_log after insert or update on public.client_messages
  for each row execute function public.log_row_change('client_message');
create trigger message_templates_log after update on public.message_templates
  for each row execute function public.log_row_change('message_template', 'kind');
create trigger fee_schedule_log after insert or update on public.fee_schedule
  for each row execute function public.log_row_change('fee_phase');
create trigger invoices_log after insert or update on public.invoices
  for each row execute function public.log_row_change('invoice');

do $$
declare t text;
begin
  foreach t in array array['message_templates', 'client_messages', 'fee_schedule', 'invoices'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.block_delete()',
                   t || '_no_delete', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.block_delete()',
                   t || '_no_truncate', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
  end loop;
end $$;

create policy message_templates_select on public.message_templates for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy client_messages_select on public.client_messages for select to authenticated
  using ((select public.current_app_role()) is not null);
create policy fee_schedule_select on public.fee_schedule for select to authenticated
  using ((select public.current_app_role()) is not null);
-- Billing is for the attorney, the principal and administrators.
create policy invoices_select on public.invoices for select to authenticated
  using ((select public.current_app_role())::text in ('principal', 'attorney', 'administrator'));

create policy message_templates_update on public.message_templates for update to authenticated
  using ((select public.current_app_role()) is not null) with check ((select public.current_app_role()) is not null);
grant update (body, attorney_approved) on public.message_templates to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'form_name_or(text, text)', 'firm_date_text(date)', 'client_message_role_check()', 'require_principal(text)',
    'invoice_for_update(uuid, text[])',
    'queue_client_message(uuid, text, text, uuid, uuid, jsonb)', 'queue_client_followups()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'mark_message_sent(uuid, text)', 'cancel_message(uuid, text)',
    'add_fee_phase(public.matter_type, text, text, integer)', 'save_fee_phase(uuid, text, integer, boolean)',
    'set_invoice_amount(uuid, integer, text)', 'approve_invoice(uuid)', 'record_invoice_sent(uuid, text)',
    'void_invoice(uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

grant execute on function public.queue_client_followups() to service_role;
