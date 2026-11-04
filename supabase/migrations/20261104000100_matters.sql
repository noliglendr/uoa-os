-- Increment 1: Matter Tracker with Deadline Control.
-- Matters move through the 11 stages (CLAUDE.md section 4) with the Gate 1
-- redline changes: response cycles, several filings and clients per matter,
-- early deadlines, appearances with transfer, notice routing, appointments.
--
-- Rules enforced here, not only in the UI:
--   R1  every notice has a deadline or an attorney "no deadline" flag
--   R3  stages 2, 3, 5 and 6 need an attorney gate (also inside response cycles)
--   R4  a matter can't close with an open deadline or open appearance
--   Every row change is written to the append-only event log.
--   Nothing is deleted: mistakes are corrected by a new, logged change.
--
-- Workflow data uses synthetic matter codes and role labels only (R5).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.matter_type as enum ('petition', 'application', 'eoir_litigation', 'federal');
create type public.matter_status as enum ('prospect', 'active', 'declined', 'closed');
create type public.forum as enum ('uscis', 'cbp', 'ice', 'immigration_court', 'bia', 'circuit_court');
create type public.appearance_form as enum ('g28', 'eoir28', 'eoir27', 'circuit');
create type public.appearance_status as enum ('open', 'withdrawn', 'closed', 'transferred');
create type public.notice_type as enum (
  'receipt', 'rfe', 'noid', 'biometrics', 'interview', 'hearing', 'decision', 'order', 'transfer', 'other'
);
create type public.deadline_kind as enum ('response', 'appointment', 'review');
create type public.deadline_status as enum ('open', 'met', 'missed', 'cancelled');
create type public.checklist_owner as enum ('client', 'firm', 'third_party');
create type public.checklist_status as enum (
  'needed', 'requested', 'received', 'drafted', 'attorney_review', 'approved', 'waived'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True for the attorney or the principal. System sessions (no signed-in user:
-- the server's scheduled jobs and seed scripts) are also allowed.
create function public.is_attorney_or_system()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is null
      or public.has_role(array['attorney', 'principal']::public.app_role[]);
$$;

create function public.require_attorney(p_what text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_attorney_or_system() then
    raise exception 'Only the attorney can %', p_what using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Next business day on or after a date (weekends only; holidays are handled
-- in the deadline module, which computes every due date).
create function public.next_business_day(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case extract(isodow from p_date)
    when 6 then p_date + 2
    when 7 then p_date + 1
    else p_date
  end;
$$;

-- Fields that changed between two versions of a row.
create function public.jsonb_changed(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, p_new -> k), '{}'::jsonb)
  from jsonb_object_keys(p_new) as k
  where p_old -> k is distinct from p_new -> k
    and k not in ('updated_at');
$$;

-- Generic change logger: <entity>.created / <entity>.updated with the changed fields.
-- TG_ARGV[0] is the entity name.
create function public.log_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_matter uuid;
  v_payload jsonb;
begin
  v_matter := (v_new ->> case when tg_argv[0] = 'matter' then 'id' else 'matter_id' end)::uuid;
  if tg_op = 'INSERT' then
    v_payload := v_new - 'created_at' - 'updated_at';
  else
    v_payload := public.jsonb_changed(to_jsonb(old), v_new);
    if v_payload = '{}'::jsonb then
      return new;
    end if;
    v_payload := jsonb_build_object(
      'changed', v_payload,
      'old', (select jsonb_object_agg(k, to_jsonb(old) -> k) from jsonb_object_keys(v_payload) k)
    );
  end if;
  perform public.log_event(
    tg_argv[0] || case when tg_op = 'INSERT' then '.created' else '.updated' end,
    tg_argv[0], v_new ->> coalesce(tg_argv[1], 'id'), v_matter, v_payload
  );
  return new;
end;
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Matters and parties
-- ---------------------------------------------------------------------------
create table public.matters (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$'),
  summary               text not null check (length(trim(summary)) > 0),
  matter_type           public.matter_type not null,
  status                public.matter_status not null default 'prospect',
  stage                 smallint not null default 1 check (stage between 1 and 11),
  urgent                boolean not null default false,
  hard_deadline         boolean not null default false,
  engagement_alert_date date,
  joint_consent         boolean not null default false,
  attorney_id           uuid not null references public.profiles (id),
  predecessor_id        uuid references public.matters (id),
  closing_letter_sent   boolean not null default false,
  decline_reason        text,
  legal_hold            boolean not null default false,
  stage_changed_at      timestamptz not null default now(),
  created_by            uuid references public.profiles (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.matters.code is 'Synthetic matter code (for example "Matter A"). Never a client name.';
comment on column public.matters.summary is 'Short description of the work. No client names or case facts in dev and test.';
comment on column public.matters.hard_deadline is
  'EOIR, federal or other hard deadline known at intake: the attorney verifies it at stage 1 (redline 3).';

-- Default attorney of record: the principal (setting attorney_of_record.default).
create function public.matters_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.attorney_id is null then
    select p.id into new.attorney_id
    from public.profiles p
    where p.active and p.role = 'principal'
    order by p.created_at
    limit 1;
  end if;
  if new.matter_type in ('eoir_litigation', 'federal') then
    new.hard_deadline := true;
  end if;
  return new;
end;
$$;

create trigger matters_defaults before insert on public.matters
  for each row execute function public.matters_defaults();

create table public.parties (
  id               uuid primary key default gen_random_uuid(),
  matter_id        uuid not null references public.matters (id),
  label            text not null check (length(trim(label)) > 0),
  party_role       text not null check (party_role in
                     ('petitioner', 'beneficiary', 'applicant', 'respondent', 'derivative', 'other')),
  is_client        boolean not null default true,
  conflict_cleared boolean not null default false,
  conflict_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.parties.label is 'Role label only (for example "Client 1"). Personal data lives in the separate store (R5).';

-- ---------------------------------------------------------------------------
-- Filings and response cycles (redline 1 and 2)
-- ---------------------------------------------------------------------------
create table public.filings (
  id                uuid primary key default gen_random_uuid(),
  matter_id         uuid not null references public.matters (id),
  cycle_id          uuid,
  form_type         text not null check (length(trim(form_type)) > 0),
  forum             public.forum not null,
  stage             smallint not null default 6 check (stage between 6 and 10),
  ref_no            text,
  filed_at          timestamptz,
  filing_method     text,
  fee_cents         integer check (fee_cents >= 0),
  proof_ref         text,
  receipt_logged_at timestamptz,
  decision          text check (decision in
                      ('approved', 'denied', 'granted', 'dismissed', 'withdrawn', 'remanded', 'other')),
  decided_at        timestamptz,
  client_informed_at timestamptz,
  post_decision     text check (post_decision in
                      ('approval_delivered', 'motion', 'appeal', 'refile', 'new_matter', 'none')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.filings.ref_no is 'Receipt or case reference. Synthetic only in dev and test.';

create table public.response_cycles (
  id         uuid primary key default gen_random_uuid(),
  matter_id  uuid not null references public.matters (id),
  filing_id  uuid not null references public.filings (id),
  kind       text not null check (kind in ('rfe', 'noid', 'i290b', 'motion', 'appeal', 'other')),
  stage      smallint not null default 4 check (stage between 4 and 6),
  status     text not null default 'open' check (status in ('open', 'filed', 'withdrawn')),
  filed_at   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.filings
  add constraint filings_cycle_fk foreign key (cycle_id) references public.response_cycles (id);

-- ---------------------------------------------------------------------------
-- Appearances (redline 6 and 7)
-- ---------------------------------------------------------------------------
create table public.appearances (
  id             uuid primary key default gen_random_uuid(),
  matter_id      uuid not null references public.matters (id),
  party_id       uuid not null references public.parties (id),
  form           public.appearance_form not null,
  forum          public.forum not null,
  status         public.appearance_status not null default 'open',
  filed_on       date,
  transferred_to uuid references public.matters (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- G-28 for USCIS/CBP/ICE; EOIR-28 for the immigration court; EOIR-27 for the BIA.
  constraint appearance_form_matches_forum check (
       (form = 'g28' and forum in ('uscis', 'cbp', 'ice'))
    or (form = 'eoir28' and forum = 'immigration_court')
    or (form = 'eoir27' and forum = 'bia')
    or (form = 'circuit' and forum = 'circuit_court')
  ),
  constraint appearance_transfer_target check ((status = 'transferred') = (transferred_to is not null))
);

-- ---------------------------------------------------------------------------
-- Attorney gates (R3)
-- ---------------------------------------------------------------------------
create table public.gates (
  id          bigint generated always as identity primary key,
  matter_id   uuid not null references public.matters (id),
  cycle_id    uuid references public.response_cycles (id),
  stage       smallint not null check (stage in (2, 3, 5, 6)),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz not null default now(),
  note        text,
  constraint gates_once unique nulls not distinct (matter_id, cycle_id, stage),
  constraint gates_cycle_stage check (cycle_id is null or stage in (5, 6))
);

comment on table public.gates is 'Attorney approval records. Written only by approve_gate(); never changed or deleted.';

-- ---------------------------------------------------------------------------
-- Evidence checklist (stage 4; redline 12)
-- ---------------------------------------------------------------------------
create table public.checklist_items (
  id                 uuid primary key default gen_random_uuid(),
  matter_id          uuid not null references public.matters (id),
  cycle_id           uuid references public.response_cycles (id),
  label              text not null check (length(trim(label)) > 0),
  owner              public.checklist_owner not null,
  status             public.checklist_status not null default 'needed',
  third_party_draft  boolean not null default false,
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- A third-party draft (expert or employer letter) is approved only by the attorney.
create function public.checklist_review_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.third_party_draft and new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.require_attorney('approve a third-party draft');
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger checklist_review_rule before insert or update on public.checklist_items
  for each row execute function public.checklist_review_rule();

-- ---------------------------------------------------------------------------
-- Deadline rules (configuration; D7) and deadlines
-- ---------------------------------------------------------------------------
create table public.deadline_rules (
  code               text primary key check (code ~ '^[A-Z][0-9]{1,2}$'),
  forum              text not null,
  label              text not null,
  kind               public.deadline_kind not null,
  days               integer check (days > 0),
  starts_from        text not null,
  mailing_extension  boolean not null default false,
  prep_days          integer check (prep_days > 0),
  source             text not null,
  note               text,
  attorney_verified  boolean not null default false,
  verified_by        uuid references public.profiles (id),
  verified_at        timestamptz,
  updated_at         timestamptz not null default now()
);

comment on column public.deadline_rules.days is 'Window in days. Null = the date on the notice controls.';
comment on table public.deadline_rules is 'Draft rules from docs/deadline-rules.md. Not relied on until the attorney verifies each one (D7).';

-- Only the attorney verifies a rule. Changing a window resets verification.
create function public.deadline_rules_verify_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.days, new.mailing_extension, new.starts_from)
     is distinct from (old.days, old.mailing_extension, old.starts_from) then
    perform public.require_attorney('change a deadline rule');
    new.attorney_verified := false;
    new.verified_by := null;
    new.verified_at := null;
  elsif new.attorney_verified is distinct from old.attorney_verified then
    perform public.require_attorney('verify a deadline rule');
    new.verified_by := case when new.attorney_verified then auth.uid() end;
    new.verified_at := case when new.attorney_verified then now() end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger deadline_rules_verify_rule before update on public.deadline_rules
  for each row execute function public.deadline_rules_verify_rule();

insert into public.deadline_rules (code, forum, label, kind, days, starts_from, mailing_extension, prep_days, source, note) values
  ('U1', 'USCIS', 'RFE response', 'response', null, 'Notice date (date on the notice controls)', false, null, '8 CFR 103.2(b)(8)(iv)', 'Maximum 12 weeks. No extensions.'),
  ('U2', 'USCIS', 'NOID response', 'response', 30, 'Notice date', true, null, '8 CFR 103.2(b)(8)(iv); 8 CFR 103.8(b)', 'The date on the notice controls when given.'),
  ('U3', 'USCIS', 'I-290B appeal (AAO)', 'response', 30, 'Decision date', true, null, '8 CFR 103.3(a)(2)(i); 8 CFR 103.8(b)', null),
  ('U4', 'USCIS', 'I-290B motion to reopen or reconsider', 'response', 30, 'Decision date', true, null, '8 CFR 103.5(a)(1)(i); 8 CFR 103.8(b)', null),
  ('U5', 'USCIS', 'Biometrics appointment', 'appointment', null, 'Notice', false, 14, 'Notice', 'Reschedule request before the date.'),
  ('U6', 'USCIS', 'USCIS interview', 'appointment', null, 'Notice', false, 14, 'Notice', null),
  ('U7', 'USCIS', 'I-751 (remove conditions)', 'response', null, 'Conditional residence start; window opens 90 days before the 2nd anniversary', false, null, 'INA 216(d)(2); 8 CFR 216.4(a)', 'Client duty; set per matter.'),
  ('E1', 'EOIR', 'Motion to reopen (IJ)', 'response', 90, 'Final administrative order', false, null, 'INA 240(c)(7); 8 CFR 1003.23(b)(1)', 'Exceptions: attorney sets the date per matter.'),
  ('E2', 'EOIR', 'Motion to reopen an in absentia order', 'response', 180, 'In absentia order', false, null, 'INA 240(b)(5)(C)(i); 8 CFR 1003.23(b)(4)(ii)', 'Lack of notice: no time limit.'),
  ('E3', 'EOIR', 'Motion to reconsider (IJ)', 'response', 30, 'Final administrative order', false, null, 'INA 240(c)(6); 8 CFR 1003.23(b)(1)', null),
  ('E4', 'EOIR', 'DHS response to a motion', 'response', 10, 'Court receives the motion', false, null, 'Immigration Court Practice Manual ch. 3 (verify)', null),
  ('E5', 'EOIR', 'Hearing (master or individual)', 'appointment', null, 'Notice', false, 14, 'Notice', null),
  ('B1', 'BIA', 'Appeal from an IJ decision (EOIR-26)', 'response', 30, 'IJ decision', false, null, '8 CFR 1003.38(b)', 'Must be received by the BIA.'),
  ('B2', 'BIA', 'Motion to reopen (BIA)', 'response', 90, 'Final administrative order', false, null, '8 CFR 1003.2(c)(2)', null),
  ('B3', 'BIA', 'Motion to reconsider (BIA)', 'response', 30, 'BIA decision', false, null, '8 CFR 1003.2(b)(2)', null),
  ('B4', 'BIA', 'Opposing party response to a motion', 'response', 13, 'Service of the motion', false, null, '8 CFR 1003.2(g)(3)', null),
  ('B5', 'BIA', 'Brief deadline', 'response', null, 'Briefing schedule', false, null, 'Notice', null),
  ('F1', 'Federal', 'Petition for review (circuit court)', 'response', 30, 'BIA final order', false, null, 'INA 242(b)(1)', 'Strict. A stay request is separate.');

create table public.notices (
  id                 uuid primary key default gen_random_uuid(),
  matter_id          uuid not null references public.matters (id),
  filing_id          uuid references public.filings (id),
  notice_type        public.notice_type not null,
  channel            text not null check (channel in ('mail', 'online', 'email', 'court', 'hand', 'other')),
  notice_date        date not null,
  received_on        date not null,
  logged_at          timestamptz not null default now(),
  logged_by          uuid references public.profiles (id) default auth.uid(),
  routed_to          text not null,
  note               text,
  no_deadline        boolean not null default false,
  no_deadline_reason text,
  no_deadline_by     uuid references public.profiles (id),
  constraint notice_dates check (received_on >= notice_date),
  constraint no_deadline_reason check (not no_deadline or no_deadline_reason is not null)
);

comment on column public.notices.routed_to is
  'attorney (same day): RFE, NOID, decision, order, hearing, interview, transfer, other. docketing (attorney informed): receipt, biometrics.';

create table public.deadlines (
  id                   uuid primary key default gen_random_uuid(),
  matter_id            uuid not null references public.matters (id),
  filing_id            uuid references public.filings (id),
  notice_id            uuid references public.notices (id),
  cycle_id             uuid references public.response_cycles (id),
  rule_code            text references public.deadline_rules (code),
  kind                 public.deadline_kind not null,
  title                text not null check (length(trim(title)) > 0),
  trigger_date         date,
  raw_due_date         date,
  due_date             date not null,
  mailing_extension    boolean not null default false,
  attorney_verified    boolean not null default false,
  verified_by          uuid references public.profiles (id),
  verified_at          timestamptz,
  attendee             text,
  prep_date            date,
  reschedule_requested boolean not null default false,
  status               public.deadline_status not null default 'open',
  completed_at         timestamptz,
  completed_by         uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column public.deadlines.raw_due_date is 'Computed date before moving off a weekend or holiday. File by the earlier date.';

create index deadlines_open_idx on public.deadlines (due_date) where status = 'open';

-- Only the attorney verifies a deadline. Changing the date resets verification.
create function public.deadlines_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.due_date, new.mailing_extension) is distinct from (old.due_date, old.mailing_extension) then
    new.attorney_verified := false;
  end if;
  if new.attorney_verified and (tg_op = 'INSERT' or not old.attorney_verified) then
    perform public.require_attorney('verify a deadline');
    new.verified_by := auth.uid();
    new.verified_at := now();
  elsif not new.attorney_verified then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    perform public.require_attorney('cancel a deadline');
  end if;
  if new.status <> 'open' and (tg_op = 'INSERT' or old.status = 'open') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger deadlines_rules before insert or update on public.deadlines
  for each row execute function public.deadlines_rules();

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  matter_id    uuid not null references public.matters (id),
  deadline_id  uuid references public.deadlines (id),
  notice_id    uuid references public.notices (id),
  title        text not null check (length(trim(title)) > 0),
  owner_role   public.app_role not null,
  due_date     date,
  status       text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_by uuid references public.profiles (id),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.escalations (
  id          bigint generated always as identity primary key,
  deadline_id uuid not null references public.deadlines (id),
  days_before integer not null,
  sent_at     timestamptz not null default now(),
  recipients  text[] not null,
  delivered   boolean not null,
  detail      text,
  unique (deadline_id, days_before)
);

comment on table public.escalations is 'One row per reminder threshold (R2). delivered = false when no email service is set (dry run).';

alter table public.event_log
  add constraint event_log_matter_fk foreign key (matter_id) references public.matters (id);

-- ---------------------------------------------------------------------------
-- R1: every notice has a deadline or an attorney "no deadline" flag.
-- Checked at commit, so log_notice() can write both in one transaction.
-- ---------------------------------------------------------------------------
create function public.notice_has_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (to_jsonb(new) ->> case when tg_table_name = 'deadlines' then 'notice_id' else 'id' end)::uuid;
begin
  if v_id is null then
    return null;
  end if;
  -- A declined or closed matter keeps its history; its deadlines may be cancelled.
  if exists (select 1 from public.notices n join public.matters m on m.id = n.matter_id
             where n.id = v_id and m.status in ('declined', 'closed')) then
    return null;
  end if;
  if not exists (select 1 from public.notices n where n.id = v_id and n.no_deadline)
     and not exists (select 1 from public.deadlines d where d.notice_id = v_id and d.status <> 'cancelled') then
    raise exception 'Rule R1: notice % needs a deadline or an attorney "no deadline" flag', v_id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger notices_r1 after insert or update on public.notices
  deferrable initially deferred
  for each row execute function public.notice_has_deadline();

create constraint trigger deadlines_r1 after update on public.deadlines
  deferrable initially deferred
  for each row when (new.notice_id is not null)
  execute function public.notice_has_deadline();

-- The "no deadline" flag is the attorney's call.
create function public.notices_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.no_deadline and (tg_op = 'INSERT' or not old.no_deadline) then
    perform public.require_attorney('record "no deadline" on a notice');
    new.no_deadline_by := auth.uid();
  end if;
  if tg_op = 'INSERT' then
    new.routed_to := case when new.notice_type in ('receipt', 'biometrics') then 'docketing' else 'attorney' end;
  elsif new.routed_to is distinct from old.routed_to then
    raise exception 'Notice routing is set by type' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger notices_rules before insert or update on public.notices
  for each row execute function public.notices_rules();

-- ---------------------------------------------------------------------------
-- Filing lifecycle (stages 6-10 per filing) and its events
-- ---------------------------------------------------------------------------
create function public.filings_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
  -- Filing needs the attorney's stage 6 approval (for the matter or the response cycle).
  if new.filed_at is not null and (v_old ->> 'filed_at') is null then
    if not exists (
      select 1 from public.gates g
      where g.matter_id = new.matter_id and g.stage = 6 and g.cycle_id is not distinct from new.cycle_id
    ) then
      raise exception 'Rule R3: the attorney must approve filing (stage 6) before it is submitted'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.decision is not null and (v_old ->> 'decision') is null and new.decided_at is null then
    new.decided_at := now();
  end if;
  if new.client_informed_at is not null and (v_old ->> 'client_informed_at') is null then
    -- The attorney (not the system, not staff) tells the client about a decision.
    perform public.require_attorney('record that the client was told the decision');
  end if;
  if new.post_decision is not null and new.decision is null then
    raise exception 'Record the decision before the post-decision step' using errcode = 'check_violation';
  end if;
  if new.receipt_logged_at is not null and new.filed_at is null then
    raise exception 'A receipt can only be logged for a filed filing' using errcode = 'check_violation';
  end if;

  new.stage := greatest(
    new.stage,
    case
      when new.post_decision is not null then 10
      when new.decision is not null then 9
      when new.receipt_logged_at is not null then 7
      else 6
    end
  );
  return new;
end;
$$;

create trigger filings_lifecycle before insert or update on public.filings
  for each row execute function public.filings_lifecycle();

create function public.filings_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_info jsonb := jsonb_build_object('form_type', new.form_type, 'forum', new.forum, 'cycle_id', new.cycle_id);
begin
  if new.filed_at is not null and (v_old ->> 'filed_at') is null then
    perform public.log_event('filing.submitted', 'filing', new.id::text, new.matter_id,
      v_info || jsonb_build_object('method', new.filing_method, 'fee_cents', new.fee_cents, 'proof_ref', new.proof_ref));
  end if;
  if new.receipt_logged_at is not null and (v_old ->> 'receipt_logged_at') is null then
    perform public.log_event('receipt.logged', 'filing', new.id::text, new.matter_id, v_info);
  end if;
  if new.decision is not null and (v_old ->> 'decision') is null then
    perform public.log_event('decision.recorded', 'filing', new.id::text, new.matter_id,
      v_info || jsonb_build_object('decision', new.decision));
  end if;
  if new.post_decision is not null and (v_old ->> 'post_decision') is null then
    perform public.log_event('postdecision.opened', 'filing', new.id::text, new.matter_id,
      v_info || jsonb_build_object('post_decision', new.post_decision));
  end if;
  return null;
end;
$$;

create trigger filings_events after insert or update on public.filings
  for each row execute function public.filings_events();

-- Appearances: R4 support and transfer events (redline 7).
create function public.appearances_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'transferred' and old.status is distinct from 'transferred' then
    perform public.log_event('appearance.transferred', 'appearance', new.id::text, new.matter_id,
      jsonb_build_object('form', new.form, 'forum', new.forum, 'transferred_to', new.transferred_to));
  end if;
  return null;
end;
$$;

create trigger appearances_events after update on public.appearances
  for each row execute function public.appearances_events();

-- ---------------------------------------------------------------------------
-- Exit checks: one source of truth for "can this stage advance?"
-- p_cycle set = checks for a response cycle (stages 4-6 inside a filing).
-- ---------------------------------------------------------------------------
create function public.exit_checks(p_matter uuid, p_cycle uuid default null)
returns table (item text, ok boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  m public.matters;
  v_stage smallint;
  v_gate boolean;
begin
  select * into m from public.matters where id = p_matter;
  if not found then
    return;
  end if;

  if p_cycle is not null then
    select c.stage into v_stage from public.response_cycles c where c.id = p_cycle and c.matter_id = p_matter;
  else
    v_stage := m.stage;
  end if;

  v_gate := v_stage in (2, 3, 5, 6) and exists (
    select 1 from public.gates g
    where g.matter_id = p_matter and g.stage = v_stage and g.cycle_id is not distinct from p_cycle
  );

  if m.status in ('declined', 'closed') then
    item := 'Matter is ' || m.status::text; ok := false; return next;
    return;
  end if;

  case v_stage
  when 1 then
    item := 'At least one client party recorded';
    ok := exists (select 1 from public.parties p where p.matter_id = p_matter and p.is_client); return next;
    item := 'Conflict check cleared for every party';
    ok := exists (select 1 from public.parties p where p.matter_id = p_matter)
          and not exists (select 1 from public.parties p where p.matter_id = p_matter and not p.conflict_cleared);
    return next;
    if m.hard_deadline then
      item := 'Hard deadline entered and verified by the attorney before engagement';
      ok := exists (select 1 from public.deadlines d where d.matter_id = p_matter and d.status = 'open')
            and not exists (select 1 from public.deadlines d
                            where d.matter_id = p_matter and d.status = 'open' and not d.attorney_verified);
      return next;
    end if;
  when 2 then
    item := 'Attorney approved engagement (signed retainer, scope, fee phases)'; ok := v_gate; return next;
    if (select count(*) from public.parties p where p.matter_id = p_matter and p.is_client) > 1 then
      item := 'Joint-representation consent recorded'; ok := m.joint_consent; return next;
    end if;
  when 3 then
    item := 'Attorney approved the strategy memo'; ok := v_gate; return next;
    item := 'Every open deadline verified by the attorney';
    ok := not exists (select 1 from public.deadlines d
                      where d.matter_id = p_matter and d.status = 'open' and not d.attorney_verified);
    return next;
  when 4 then
    item := 'Evidence checklist has at least one item';
    ok := exists (select 1 from public.checklist_items i
                  where i.matter_id = p_matter and i.cycle_id is not distinct from p_cycle);
    return next;
    item := 'Every checklist item received, drafted, approved or waived';
    ok := not exists (select 1 from public.checklist_items i
                      where i.matter_id = p_matter and i.cycle_id is not distinct from p_cycle
                        and i.status not in ('received', 'drafted', 'approved', 'waived'));
    return next;
    item := 'Every third-party draft reviewed by the attorney';
    ok := not exists (select 1 from public.checklist_items i
                      where i.matter_id = p_matter and i.cycle_id is not distinct from p_cycle
                        and i.third_party_draft and i.status not in ('approved', 'waived'));
    return next;
  when 5 then
    item := 'Attorney final review done; signatures collected; packet locked'; ok := v_gate; return next;
  when 6 then
    item := 'Attorney approved and signed the filing'; ok := v_gate; return next;
    if p_cycle is null then
      item := 'At least one filing recorded';
      ok := exists (select 1 from public.filings f where f.matter_id = p_matter and f.cycle_id is null); return next;
      item := 'Every filing submitted (method, fee, proof captured)';
      ok := not exists (select 1 from public.filings f
                        where f.matter_id = p_matter and f.cycle_id is null and f.filed_at is null);
      return next;
      item := 'Appearance form on file for every client';
      ok := not exists (select 1 from public.parties p
                        where p.matter_id = p_matter and p.is_client
                          and not exists (select 1 from public.appearances a
                                          where a.party_id = p.id and a.status = 'open'));
      return next;
    end if;
  when 7 then
    item := 'Receipt logged for every filing';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.receipt_logged_at is null);
    return next;
  when 8 then
    item := 'Decision recorded for every filing';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.decision is null);
    return next;
    item := 'No response cycle still open';
    ok := not exists (select 1 from public.response_cycles c where c.matter_id = p_matter and c.status = 'open');
    return next;
  when 9 then
    item := 'Attorney told the client every decision';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.client_informed_at is null);
    return next;
  when 10 then
    item := 'Post-decision step recorded for every filing (approval delivered, motion, appeal or refile)';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.post_decision is null);
    return next;
  when 11 then
    null;
  end case;
end;
$$;

-- Closure checks (stage 11; R4).
create function public.closure_checks(p_matter uuid)
returns table (item text, ok boolean)
language plpgsql
stable
set search_path = ''
as $$
begin
  item := 'Matter is at stage 10 (post-decision)';
  ok := exists (select 1 from public.matters m where m.id = p_matter and m.stage = 10); return next;
  item := 'Every filing decided';
  ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.decision is null); return next;
  item := 'No open deadline (R4)';
  ok := not exists (select 1 from public.deadlines d where d.matter_id = p_matter and d.status = 'open'); return next;
  item := 'No open appearance that was not transferred (R4)';
  ok := not exists (select 1 from public.appearances a where a.matter_id = p_matter and a.status = 'open'); return next;
  item := 'Closing letter sent (with client duties, for example I-751 and AR-11)';
  ok := exists (select 1 from public.matters m where m.id = p_matter and m.closing_letter_sent); return next;
end;
$$;

create function public.raise_failed(p_rule text, p_checks text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if array_length(p_checks, 1) > 0 then
    raise exception '%: %', p_rule, array_to_string(p_checks, '; ') using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions (the only way to change stage, status and gates)
-- ---------------------------------------------------------------------------
create function public.require_staff()
returns public.app_role
language plpgsql
stable
set search_path = ''
as $$
declare
  v public.app_role := public.current_app_role();
begin
  if v is null and auth.uid() is not null then
    raise exception 'Only active, MFA-verified staff can do this' using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

create function public.approve_gate(p_matter uuid, p_stage smallint, p_cycle uuid default null, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current smallint;
  v_id bigint;
begin
  perform public.require_staff();
  perform public.require_attorney('approve a stage gate');
  if p_cycle is null then
    select stage into v_current from public.matters where id = p_matter and status in ('prospect', 'active') for update;
  else
    select stage into v_current from public.response_cycles
    where id = p_cycle and matter_id = p_matter and status = 'open' for update;
  end if;
  if v_current is distinct from p_stage then
    raise exception 'The gate for stage % can only be approved while the matter (or cycle) is at that stage', p_stage
      using errcode = 'check_violation';
  end if;

  insert into public.gates (matter_id, cycle_id, stage, approved_by, note)
  values (p_matter, p_cycle, p_stage, auth.uid(), p_note)
  returning id into v_id;

  perform public.log_event(
    case p_stage when 2 then 'engagement.signed' when 3 then 'strategy.approved'
                 when 5 then 'packet.locked' else 'filing.approved' end,
    'gate', v_id::text, p_matter, jsonb_build_object('stage', p_stage, 'cycle_id', p_cycle, 'note', p_note));
  if p_stage = 2 and p_cycle is null then
    update public.matters set status = 'active' where id = p_matter;
  end if;
  return v_id;
end;
$$;

create function public.advance_stage(p_matter uuid)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from smallint;
  v_failed text[];
begin
  perform public.require_staff();
  select stage into v_from from public.matters where id = p_matter for update;
  if v_from is null then
    raise exception 'Matter not found' using errcode = 'no_data_found';
  end if;
  if v_from >= 10 then
    raise exception 'Use close_matter() to close a matter (stage 11)' using errcode = 'check_violation';
  end if;
  select array_agg(item) into v_failed from public.exit_checks(p_matter) where not ok;
  perform public.raise_failed('Stage ' || v_from || ' exit gate not met', v_failed);

  update public.matters set stage = v_from + 1, stage_changed_at = now() where id = p_matter;
  if v_from = 4 then
    perform public.log_event('evidence.complete', 'matter', p_matter::text, p_matter, '{}'::jsonb);
  end if;
  perform public.log_event('matter.stage_changed', 'matter', p_matter::text, p_matter,
    jsonb_build_object('from', v_from, 'to', v_from + 1));
  return v_from + 1;
end;
$$;

create function public.advance_cycle(p_cycle uuid)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.response_cycles;
  v_failed text[];
begin
  perform public.require_staff();
  select * into c from public.response_cycles where id = p_cycle and status = 'open' for update;
  if not found then
    raise exception 'Open response cycle not found' using errcode = 'no_data_found';
  end if;
  select array_agg(item) into v_failed from public.exit_checks(c.matter_id, p_cycle) where not ok;
  perform public.raise_failed('Response stage ' || c.stage || ' exit gate not met', v_failed);

  if c.stage < 6 then
    update public.response_cycles set stage = c.stage + 1 where id = p_cycle;
    if c.stage = 4 then
      perform public.log_event('evidence.complete', 'response_cycle', p_cycle::text, c.matter_id, '{}'::jsonb);
    end if;
    return c.stage + 1;
  end if;

  -- Stage 6 passed: the response is filed. Its own deadline is met.
  update public.response_cycles set status = 'filed', filed_at = now() where id = p_cycle;
  update public.deadlines set status = 'met' where cycle_id = p_cycle and status = 'open';
  perform public.log_event('filing.submitted', 'response_cycle', p_cycle::text, c.matter_id,
    jsonb_build_object('kind', c.kind, 'filing_id', c.filing_id));
  return 6;
end;
$$;

create function public.open_response_cycle(p_filing uuid, p_kind text, p_notice uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.filings;
  v_id uuid;
begin
  perform public.require_staff();
  select * into f from public.filings where id = p_filing;
  if not found then
    raise exception 'Filing not found' using errcode = 'no_data_found';
  end if;
  insert into public.response_cycles (matter_id, filing_id, kind) values (f.matter_id, p_filing, p_kind)
  returning id into v_id;
  -- The notice's response deadline now belongs to this cycle.
  if p_notice is not null then
    update public.deadlines set cycle_id = v_id
    where notice_id = p_notice and kind = 'response' and status = 'open';
  end if;
  return v_id;
end;
$$;

create function public.decline_matter(p_matter uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  perform public.require_attorney('decline a matter');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason (the non-engagement letter is sent outside the system)' using errcode = 'check_violation';
  end if;
  update public.matters set status = 'declined', decline_reason = p_reason
  where id = p_matter and status = 'prospect';
  if not found then
    raise exception 'Only a prospect (before engagement) can be declined' using errcode = 'check_violation';
  end if;
  update public.deadlines set status = 'cancelled' where matter_id = p_matter and status = 'open';
  perform public.log_event('matter.declined', 'matter', p_matter::text, p_matter, jsonb_build_object('reason', p_reason));
end;
$$;

create function public.close_matter(p_matter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failed text[];
begin
  perform public.require_staff();
  perform public.require_attorney('close a matter');
  perform 1 from public.matters where id = p_matter for update;
  select array_agg(item) into v_failed from public.closure_checks(p_matter) where not ok;
  perform public.raise_failed('Closure not allowed', v_failed);
  update public.matters set stage = 11, status = 'closed', stage_changed_at = now() where id = p_matter;
  perform public.log_event('matter.closed', 'matter', p_matter::text, p_matter, '{}'::jsonb);
end;
$$;

-- Log a notice and its deadline in one transaction (R1).
-- p_deadline: {rule_code, kind, title, trigger_date, raw_due_date, due_date,
--              mailing_extension, attendee, prep_date}, computed by the
--              server's deadline module. Null = no deadline: the attorney's
--              reason is recorded, or (other staff) an attorney review is created.
create function public.log_notice(
  p_matter       uuid,
  p_filing       uuid,
  p_type         public.notice_type,
  p_channel      text,
  p_notice_date  date,
  p_received_on  date,
  p_note         text default null,
  p_deadline     jsonb default null,
  p_no_deadline_reason text default null,
  p_review_due   date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notice uuid;
  v_deadline uuid;
  v_kind public.deadline_kind;
  v_routed text;
  v_due date;
begin
  perform public.require_staff();
  if p_filing is not null and not exists (select 1 from public.filings where id = p_filing and matter_id = p_matter) then
    raise exception 'Filing does not belong to this matter' using errcode = 'check_violation';
  end if;

  insert into public.notices (matter_id, filing_id, notice_type, channel, notice_date, received_on, note,
                              no_deadline, no_deadline_reason, routed_to)
  values (p_matter, p_filing, p_type, p_channel, p_notice_date, p_received_on, p_note,
          p_deadline is null and p_no_deadline_reason is not null, p_no_deadline_reason, '')
  returning id, routed_to into v_notice, v_routed;

  perform public.log_event('notice.received', 'notice', v_notice::text, p_matter,
    jsonb_build_object('type', p_type, 'channel', p_channel, 'routed_to', v_routed, 'filing_id', p_filing));

  if p_deadline is not null then
    v_kind := coalesce((p_deadline ->> 'kind')::public.deadline_kind, 'response');
    v_due := (p_deadline ->> 'due_date')::date;
    insert into public.deadlines (matter_id, filing_id, notice_id, rule_code, kind, title, trigger_date,
                                  raw_due_date, due_date, mailing_extension, attendee, prep_date)
    values (p_matter, p_filing, v_notice, nullif(p_deadline ->> 'rule_code', ''), v_kind, p_deadline ->> 'title',
            (p_deadline ->> 'trigger_date')::date, (p_deadline ->> 'raw_due_date')::date, v_due,
            coalesce((p_deadline ->> 'mailing_extension')::boolean, false),
            p_deadline ->> 'attendee', (p_deadline ->> 'prep_date')::date)
    returning id into v_deadline;
    if (p_deadline ->> 'prep_date') is not null then
      insert into public.tasks (matter_id, deadline_id, notice_id, title, owner_role, due_date)
      values (p_matter, v_deadline, v_notice, 'Prepare for: ' || (p_deadline ->> 'title'), 'paralegal',
              (p_deadline ->> 'prep_date')::date);
    end if;
  elsif p_no_deadline_reason is null then
    -- Staff found no deadline: the attorney decides by the next business day.
    insert into public.deadlines (matter_id, filing_id, notice_id, kind, title, due_date)
    values (p_matter, p_filing, v_notice, 'review', 'Attorney: set a deadline or record "no deadline" for this ' || p_type::text || ' notice',
            coalesce(p_review_due, public.next_business_day(current_date + 1)));
  end if;

  -- Route the notice the same day (redline 8).
  insert into public.tasks (matter_id, notice_id, title, owner_role, due_date)
  values (p_matter, v_notice,
          'Review ' || p_type::text || ' notice' || case when v_routed = 'docketing' then ' (attorney informed)' else '' end,
          (case when v_routed = 'attorney' then 'attorney' else 'docketing' end)::public.app_role, current_date);

  -- A receipt notice logs the filing's receipt; agency action moves the filing to stage 8.
  if p_filing is not null then
    if p_type = 'receipt' then
      update public.filings set receipt_logged_at = coalesce(receipt_logged_at, now()) where id = p_filing;
    elsif p_type in ('rfe', 'noid', 'biometrics', 'interview', 'hearing', 'order', 'transfer') then
      update public.filings set stage = greatest(stage, 8) where id = p_filing and decision is null;
    end if;
  end if;
  return v_notice;
end;
$$;

-- Attorney records "no deadline" on a notice; any review placeholder is cancelled.
create function public.record_no_deadline(p_notice uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  perform public.require_attorney('record "no deadline" on a notice');
  update public.notices set no_deadline = true, no_deadline_reason = p_reason where id = p_notice;
  update public.deadlines set status = 'cancelled' where notice_id = p_notice and kind = 'review' and status = 'open';
end;
$$;

-- ---------------------------------------------------------------------------
-- Change logging and updated_at
-- ---------------------------------------------------------------------------
create trigger matters_touch before update on public.matters for each row execute function public.touch_updated_at();
create trigger parties_touch before update on public.parties for each row execute function public.touch_updated_at();
create trigger filings_touch before update on public.filings for each row execute function public.touch_updated_at();
create trigger cycles_touch before update on public.response_cycles for each row execute function public.touch_updated_at();
create trigger appearances_touch before update on public.appearances for each row execute function public.touch_updated_at();
create trigger checklist_touch before update on public.checklist_items for each row execute function public.touch_updated_at();
create trigger deadlines_touch before update on public.deadlines for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

create trigger matters_log after insert or update on public.matters for each row execute function public.log_row_change('matter');
create trigger parties_log after insert or update on public.parties for each row execute function public.log_row_change('party');
create trigger filings_log after insert or update on public.filings for each row execute function public.log_row_change('filing');
create trigger cycles_log after insert or update on public.response_cycles for each row execute function public.log_row_change('response_cycle');
create trigger appearances_log after insert or update on public.appearances for each row execute function public.log_row_change('appearance');
create trigger checklist_log after insert or update on public.checklist_items for each row execute function public.log_row_change('checklist_item');
create trigger notices_log after update on public.notices for each row execute function public.log_row_change('notice');
create trigger deadlines_log after insert or update on public.deadlines for each row execute function public.log_row_change('deadline');
create trigger tasks_log after insert or update on public.tasks for each row execute function public.log_row_change('task');
create trigger rules_log after update on public.deadline_rules for each row execute function public.log_row_change('deadline_rule', 'code');
-- Escalations have no matter_id column, so they get their own event.
create function public.escalations_matter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_event('deadline.escalated', 'deadline', new.deadline_id::text,
    (select d.matter_id from public.deadlines d where d.id = new.deadline_id),
    jsonb_build_object('days_before', new.days_before, 'recipients', cardinality(new.recipients), 'delivered', new.delivered));
  return null;
end;
$$;
create trigger escalations_log after insert on public.escalations for each row execute function public.escalations_matter();

-- Nothing is deleted, by anyone (assumption 17).
create function public.block_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are never deleted; record a status change instead', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['matters', 'parties', 'filings', 'response_cycles', 'appearances', 'gates',
                           'checklist_items', 'deadline_rules', 'notices', 'deadlines', 'tasks', 'escalations'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.block_delete()',
                   t || '_no_delete', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.block_delete()',
                   t || '_no_truncate', t);
  end loop;
end $$;

-- Gates are immutable.
create trigger gates_no_update before update on public.gates
  for each row execute function public.event_log_block_change();

-- ---------------------------------------------------------------------------
-- Settings added by Increment 1
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description, decision) values
  ('escalation.recipients', '["attorney_of_record", "principal", "docketing"]',
   'Who gets deadline reminders: attorney_of_record, principal, docketing (every active Docketing user).', 'D12'),
  ('dashboard.stalled_days', '14',
   'A matter is stalled when nothing has been logged on it for this many days.', null);

-- ---------------------------------------------------------------------------
-- Access: row-level security and grants
-- Every active, MFA-verified staff member can read all workflow data.
-- Writes are limited by column grants; stage, status, gates and verification
-- change only through the functions and triggers above.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['matters', 'parties', 'filings', 'response_cycles', 'appearances', 'gates',
                           'checklist_items', 'deadline_rules', 'notices', 'deadlines', 'tasks', 'escalations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.current_app_role() is not null)',
                   t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
  end loop;
end $$;

-- Staff can insert and update these tables (columns below).
do $$
declare t text;
begin
  foreach t in array array['matters', 'parties', 'filings', 'appearances', 'checklist_items', 'deadlines', 'tasks', 'deadline_rules'] loop
    execute format('create policy %I on public.%I for update to authenticated using (public.current_app_role() is not null) with check (public.current_app_role() is not null)',
                   t || '_update', t);
  end loop;
  foreach t in array array['matters', 'parties', 'filings', 'appearances', 'checklist_items', 'deadlines', 'tasks'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.current_app_role() is not null)',
                   t || '_insert', t);
  end loop;
end $$;

grant insert (code, summary, matter_type, urgent, hard_deadline, engagement_alert_date, attorney_id, predecessor_id)
  on public.matters to authenticated;
grant update (summary, urgent, hard_deadline, engagement_alert_date, joint_consent, attorney_id,
              closing_letter_sent, legal_hold)
  on public.matters to authenticated;

grant insert (matter_id, label, party_role, is_client, conflict_cleared, conflict_note) on public.parties to authenticated;
grant update (label, party_role, is_client, conflict_cleared, conflict_note) on public.parties to authenticated;

grant insert (matter_id, cycle_id, form_type, forum, ref_no) on public.filings to authenticated;
grant update (form_type, forum, ref_no, filed_at, filing_method, fee_cents, proof_ref, receipt_logged_at,
              decision, client_informed_at, post_decision)
  on public.filings to authenticated;

grant insert (matter_id, party_id, form, forum, filed_on) on public.appearances to authenticated;
grant update (status, filed_on, transferred_to) on public.appearances to authenticated;

grant insert (matter_id, cycle_id, label, owner, status, third_party_draft) on public.checklist_items to authenticated;
grant update (label, owner, status) on public.checklist_items to authenticated;

grant insert (matter_id, filing_id, notice_id, cycle_id, rule_code, kind, title, trigger_date, raw_due_date, due_date,
              mailing_extension, attorney_verified, attendee, prep_date)
  on public.deadlines to authenticated;
grant update (title, raw_due_date, due_date, mailing_extension, attorney_verified, attendee, prep_date,
              reschedule_requested, status)
  on public.deadlines to authenticated;

grant insert (matter_id, deadline_id, title, owner_role, due_date) on public.tasks to authenticated;
grant update (status) on public.tasks to authenticated;

grant update (days, mailing_extension, starts_from, attorney_verified, note) on public.deadline_rules to authenticated;

-- Task completion stamps.
create function public.tasks_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' and old.status = 'open' then
    new.completed_by := auth.uid();
    new.completed_at := now();
  end if;
  return new;
end;
$$;
create trigger tasks_rules before update on public.tasks for each row execute function public.tasks_rules();

do $$
declare f text;
begin
  foreach f in array array[
    'approve_gate(uuid, smallint, uuid, text)', 'advance_stage(uuid)', 'advance_cycle(uuid)',
    'open_response_cycle(uuid, text, uuid)', 'decline_matter(uuid, text)', 'close_matter(uuid)',
    'log_notice(uuid, uuid, public.notice_type, text, date, date, text, jsonb, text, date)',
    'record_no_deadline(uuid, text)', 'exit_checks(uuid, uuid)', 'closure_checks(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
