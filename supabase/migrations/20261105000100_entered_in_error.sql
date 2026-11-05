-- Fixing mistakes (decision #20). Nothing is deleted (assumption 17); instead:
-- * Edit: edit_record() corrects listed fields only (a typo in a form type, a
--   wrong date, a party label), only while the matter is open. The row-change
--   log keeps the old value.
-- * Entered in error: mark_entered_in_error() takes a parties, filings,
--   notices, deadlines or checklist_items row out of the work (lists, exit and
--   closure checks, reminders) with a reason. The row stays in the record, the
--   history and the export, can't be undone, and can't change afterwards.
-- Both are security definer (staff have no direct write access to these
-- columns, or to notices at all): they check the caller themselves, and every
-- trigger rule (Intake limits, attorney-only steps, R1) still applies.

-- ---------------------------------------------------------------------------
-- Columns and the guard
-- ---------------------------------------------------------------------------

-- A row marked as entered in error is frozen, and the marker is set only
-- through mark_entered_in_error().
create function public.void_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.voided_at is not null then
    raise exception 'This was marked as entered in error, so it can no longer change' using errcode = 'check_violation';
  end if;
  if (new.voided_at, new.voided_by, new.void_reason) is distinct from (old.voided_at, old.voided_by, old.void_reason)
     and coalesce(current_setting('app.voiding', true), '') <> 'on' then
    raise exception 'Use "Entered in error" to take a record out' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['parties', 'filings', 'notices', 'deadlines', 'checklist_items'] loop
    execute format('alter table public.%I add column voided_at timestamptz, add column voided_by uuid references public.profiles (id), add column void_reason text', t);
    execute format('alter table public.%I add constraint %I check ((voided_at is null) = (void_reason is null))', t, t || '_void_reason');
    execute format('create trigger %I before update on public.%I for each row execute function public.void_guard()', t || '_void_guard', t);
  end loop;
end $$;

-- Voiding cancels the record's deadlines without the attorney-only cancel step;
-- mark_entered_in_error() decides who may void what.
create or replace function public.deadlines_rules()
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
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled')
     and coalesce(current_setting('app.voiding', true), '') <> 'on' then
    perform public.require_attorney('cancel a deadline');
  end if;
  if new.status <> 'open' and (tg_op = 'INSERT' or old.status = 'open') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  end if;
  return new;
end;
$$;

-- R1 does not apply to a notice entered in error.
create or replace function public.notice_has_deadline()
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
  if exists (select 1 from public.notices n where n.id = v_id and n.voided_at is not null) then
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

-- ---------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------

-- The row as jsonb, after checking the caller, the table and the matter.
create function public.correctable_row(p_table text, p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_status public.matter_status;
begin
  if public.current_app_role() is null then
    raise exception 'Only active, MFA-verified staff can do this' using errcode = 'insufficient_privilege';
  end if;
  if p_table not in ('parties', 'filings', 'notices', 'deadlines', 'checklist_items') then
    raise exception 'This kind of record can''t be corrected here' using errcode = 'check_violation';
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table) into v_row using p_id;
  if v_row is null then
    raise exception 'Record not found' using errcode = 'no_data_found';
  end if;
  if v_row ->> 'voided_at' is not null then
    raise exception 'This was already marked as entered in error' using errcode = 'check_violation';
  end if;
  select m.status into v_status from public.matters m where m.id = (v_row ->> 'matter_id')::uuid;
  if v_status not in ('prospect', 'active') then
    raise exception 'The matter is %, so its records can no longer change', v_status using errcode = 'check_violation';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Edit
-- ---------------------------------------------------------------------------

create function public.edit_record(p_table text, p_id uuid, p_values jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := public.correctable_row(p_table, p_id);
  v_allowed text[] := case p_table
    when 'parties' then array['label', 'party_role']
    when 'filings' then array['form_type', 'forum', 'ref_no', 'filing_method', 'fee_cents', 'proof_ref']
    when 'notices' then array['channel', 'notice_date', 'received_on', 'note']
    when 'deadlines' then array['title', 'due_date', 'attendee']
    when 'checklist_items' then array['label', 'owner']
  end;
  v_key text;
begin
  for v_key in select jsonb_object_keys(coalesce(p_values, '{}'::jsonb)) loop
    if not v_key = any (v_allowed) then
      raise exception 'The field "%" can''t be edited here', v_key using errcode = 'check_violation';
    end if;
  end loop;

  case p_table
  when 'parties' then
    update public.parties set
      label      = case when p_values ? 'label' then trim(p_values ->> 'label') else label end,
      party_role = case when p_values ? 'party_role' then p_values ->> 'party_role' else party_role end
    where id = p_id;
  when 'filings' then
    update public.filings set
      form_type     = case when p_values ? 'form_type' then trim(p_values ->> 'form_type') else form_type end,
      forum         = case when p_values ? 'forum' then (p_values ->> 'forum')::public.forum else forum end,
      ref_no        = case when p_values ? 'ref_no' then nullif(trim(p_values ->> 'ref_no'), '') else ref_no end,
      filing_method = case when p_values ? 'filing_method' then nullif(trim(p_values ->> 'filing_method'), '') else filing_method end,
      fee_cents     = case when p_values ? 'fee_cents' then (p_values ->> 'fee_cents')::integer else fee_cents end,
      proof_ref     = case when p_values ? 'proof_ref' then nullif(trim(p_values ->> 'proof_ref'), '') else proof_ref end
    where id = p_id;
  when 'notices' then
    update public.notices set
      channel     = case when p_values ? 'channel' then p_values ->> 'channel' else channel end,
      notice_date = case when p_values ? 'notice_date' then (p_values ->> 'notice_date')::date else notice_date end,
      received_on = case when p_values ? 'received_on' then (p_values ->> 'received_on')::date else received_on end,
      note        = case when p_values ? 'note' then nullif(trim(p_values ->> 'note'), '') else note end
    where id = p_id;
  when 'deadlines' then
    if v_row ->> 'status' <> 'open' then
      raise exception 'Only an open deadline can be edited' using errcode = 'check_violation';
    end if;
    -- A new date clears the attorney's verification (deadlines_rules).
    update public.deadlines set
      title        = case when p_values ? 'title' then trim(p_values ->> 'title') else title end,
      due_date     = case when p_values ? 'due_date' then (p_values ->> 'due_date')::date else due_date end,
      raw_due_date = case when p_values ? 'due_date' and (p_values ->> 'due_date')::date <> due_date
                          then (p_values ->> 'due_date')::date else raw_due_date end,
      attendee     = case when p_values ? 'attendee' then nullif(trim(p_values ->> 'attendee'), '') else attendee end
    where id = p_id;
  when 'checklist_items' then
    update public.checklist_items set
      label = case when p_values ? 'label' then trim(p_values ->> 'label') else label end,
      owner = case when p_values ? 'owner' then (p_values ->> 'owner')::public.checklist_owner else owner end
    where id = p_id;
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entered in error
-- ---------------------------------------------------------------------------

create function public.mark_entered_in_error(p_table text, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := public.correctable_row(p_table, p_id);
  v_reason text := trim(coalesce(p_reason, ''));
  v_deadlines uuid[];
begin
  if v_reason = '' then
    raise exception 'Give a reason (for example "logged on the wrong matter")' using errcode = 'check_violation';
  end if;

  -- Who may, and what must happen first.
  case p_table
  when 'parties' then
    if exists (select 1 from public.appearances a where a.party_id = p_id and a.status = 'open') then
      raise exception 'This party has an open appearance. Close or transfer it first.' using errcode = 'check_violation';
    end if;
  when 'filings' then
    if v_row ->> 'filed_at' is not null then
      perform public.require_attorney('mark a filed filing as entered in error');
    end if;
    if exists (select 1 from public.notices n where n.filing_id = p_id and n.voided_at is null) then
      raise exception 'This filing has notices. Mark them as entered in error first.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.response_cycles c where c.filing_id = p_id) then
      raise exception 'A response was opened on this filing, so it stays in the work.' using errcode = 'check_violation';
    end if;
  when 'notices' then
    if (v_row ->> 'no_deadline')::boolean
       or exists (select 1 from public.deadlines d where d.notice_id = p_id and d.voided_at is null and d.attorney_verified) then
      perform public.require_attorney('mark a notice the attorney has acted on as entered in error');
    end if;
    if exists (select 1 from public.deadlines d where d.notice_id = p_id and d.cycle_id is not null) then
      raise exception 'A response was opened from this notice, so it stays in the work.' using errcode = 'check_violation';
    end if;
  when 'deadlines' then
    perform public.require_attorney('mark a deadline as entered in error');
    if v_row ->> 'notice_id' is not null
       and not exists (select 1 from public.notices n
                       where n.id = (v_row ->> 'notice_id')::uuid and (n.no_deadline or n.voided_at is not null))
       and not exists (select 1 from public.deadlines d
                       where d.notice_id = (v_row ->> 'notice_id')::uuid and d.id <> p_id and d.status <> 'cancelled') then
      raise exception 'This is the only deadline for its notice (rule R1). Add the right deadline first, or mark the notice as entered in error.'
        using errcode = 'check_violation';
    end if;
  when 'checklist_items' then
    if v_row ->> 'reviewed_by' is not null then
      perform public.require_attorney('mark an attorney-reviewed draft as entered in error');
    end if;
  end case;

  perform set_config('app.voiding', 'on', true);

  -- The record's own deadlines (and their tasks) leave the work with it.
  select coalesce(array_agg(d.id), '{}') into v_deadlines
  from public.deadlines d
  where d.voided_at is null
    and ((p_table = 'deadlines' and d.id = p_id)
      or (p_table = 'notices' and d.notice_id = p_id)
      or (p_table = 'filings' and d.filing_id = p_id));
  update public.deadlines set
    status = case when status = 'open' then 'cancelled'::public.deadline_status else status end,
    voided_at = now(), voided_by = auth.uid(),
    void_reason = case when id = p_id then v_reason else 'Entered in error with its ' || rtrim(p_table, 's') || ': ' || v_reason end
  where id = any (v_deadlines);
  update public.tasks set status = 'cancelled', completed_at = now(), completed_by = auth.uid()
  where status = 'open' and (deadline_id = any (v_deadlines) or (p_table = 'notices' and notice_id = p_id));

  case p_table
  when 'parties' then
    update public.parties set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason where id = p_id;
  when 'filings' then
    update public.filings set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason where id = p_id;
  when 'notices' then
    update public.notices set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason where id = p_id;
  when 'checklist_items' then
    update public.checklist_items set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason where id = p_id;
  else
    null; -- deadlines: done above
  end case;

  perform set_config('app.voiding', 'off', true);
end;
$$;

revoke execute on function public.edit_record(text, uuid, jsonb) from public, anon;
revoke execute on function public.mark_entered_in_error(text, uuid, text) from public, anon;
revoke execute on function public.correctable_row(text, uuid) from public, anon, authenticated;
grant execute on function public.edit_record(text, uuid, jsonb) to authenticated;
grant execute on function public.mark_entered_in_error(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rows entered in error leave the checks, the dashboard and the sweep
-- ---------------------------------------------------------------------------

create or replace function public.exit_checks(p_matter uuid, p_cycle uuid default null)
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
    ok := exists (select 1 from public.parties p where p.matter_id = p_matter and p.is_client and p.voided_at is null); return next;
    item := 'Conflict check cleared for every party';
    ok := exists (select 1 from public.parties p where p.matter_id = p_matter and p.voided_at is null)
          and not exists (select 1 from public.parties p where p.matter_id = p_matter and p.voided_at is null and not p.conflict_cleared);
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
    if (select count(*) from public.parties p where p.matter_id = p_matter and p.is_client and p.voided_at is null) > 1 then
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
                  where i.matter_id = p_matter and i.cycle_id is not distinct from p_cycle and i.voided_at is null);
    return next;
    item := 'Every checklist item received, drafted, approved or waived';
    ok := not exists (select 1 from public.checklist_items i
                      where i.matter_id = p_matter and i.cycle_id is not distinct from p_cycle and i.voided_at is null
                        and i.status not in ('received', 'drafted', 'approved', 'waived'));
    return next;
    item := 'Every third-party draft reviewed by the attorney';
    ok := not exists (select 1 from public.checklist_items i
                      where i.matter_id = p_matter and i.cycle_id is not distinct from p_cycle and i.voided_at is null
                        and i.third_party_draft and i.status not in ('approved', 'waived'));
    return next;
  when 5 then
    item := 'Attorney final review done; signatures collected; packet locked'; ok := v_gate; return next;
  when 6 then
    item := 'Attorney approved and signed the filing'; ok := v_gate; return next;
    if p_cycle is null then
      item := 'At least one filing recorded';
      ok := exists (select 1 from public.filings f where f.matter_id = p_matter and f.cycle_id is null and f.voided_at is null); return next;
      item := 'Every filing submitted (method, fee, proof captured)';
      ok := not exists (select 1 from public.filings f
                        where f.matter_id = p_matter and f.cycle_id is null and f.voided_at is null and f.filed_at is null);
      return next;
      item := 'Appearance form on file for every client';
      ok := not exists (select 1 from public.parties p
                        where p.matter_id = p_matter and p.is_client and p.voided_at is null
                          and not exists (select 1 from public.appearances a
                                          where a.party_id = p.id and a.status = 'open'));
      return next;
    end if;
  when 7 then
    item := 'Receipt logged for every filing';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.voided_at is null and f.receipt_logged_at is null);
    return next;
  when 8 then
    item := 'Decision recorded for every filing';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.voided_at is null and f.decision is null);
    return next;
    item := 'No response cycle still open';
    ok := not exists (select 1 from public.response_cycles c where c.matter_id = p_matter and c.status = 'open');
    return next;
  when 9 then
    item := 'Attorney told the client every decision';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.voided_at is null and f.client_informed_at is null);
    return next;
  when 10 then
    item := 'Post-decision step recorded for every filing (approval delivered, motion, appeal or refile)';
    ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.voided_at is null and f.post_decision is null);
    return next;
  when 11 then
    null;
  end case;
end;
$$;

create or replace function public.closure_checks(p_matter uuid)
returns table (item text, ok boolean)
language plpgsql
stable
set search_path = ''
as $$
begin
  item := 'Matter is at stage 10 (post-decision)';
  ok := exists (select 1 from public.matters m where m.id = p_matter and m.stage = 10); return next;
  item := 'Every filing decided';
  ok := not exists (select 1 from public.filings f where f.matter_id = p_matter and f.voided_at is null and f.decision is null); return next;
  item := 'No open deadline (R4)';
  ok := not exists (select 1 from public.deadlines d where d.matter_id = p_matter and d.status = 'open'); return next;
  item := 'No open appearance that was not transferred (R4)';
  ok := not exists (select 1 from public.appearances a where a.matter_id = p_matter and a.status = 'open'); return next;
  item := 'Closing letter sent (with client duties, for example I-751 and AR-11)';
  ok := exists (select 1 from public.matters m where m.id = p_matter and m.closing_letter_sent); return next;
end;
$$;

create or replace function public.sweep_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'matters', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'code', m.code, 'matter_type', m.matter_type, 'stage', m.stage, 'status', m.status))
      from public.matters m where m.status in ('prospect', 'active')), '[]'::jsonb),
    'filings', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'matter_id', f.matter_id, 'form_type', f.form_type, 'forum', f.forum,
                                          'ref_no', f.ref_no, 'stage', f.stage))
      from public.filings f where f.filed_at is not null and f.decision is null and f.voided_at is null), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object('entity_id', c.entity_id, 'occurred_at', c.occurred_at, 'actor_id', c.actor_id, 'payload', c.payload))
      from (
        select distinct on (e.entity_id) e.entity_id, e.occurred_at, e.actor_id, e.payload
        from public.event_log e
        where e.event_type = 'sweep.checked'
        order by e.entity_id, e.occurred_at desc
      ) c), '[]'::jsonb),
    'names', public.staff_names()
  );
$$;

create or replace function public.dashboard_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'matters', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'code', m.code, 'summary', m.summary, 'stage', m.stage, 'status', m.status,
                                          'urgent', m.urgent, 'engagement_alert_date', m.engagement_alert_date,
                                          'stage_changed_at', m.stage_changed_at))
      from public.matters m), '[]'::jsonb),
    'gates', coalesce((
      select jsonb_agg(jsonb_build_object('matter_id', g.matter_id, 'cycle_id', g.cycle_id, 'stage', g.stage))
      from public.gates g), '[]'::jsonb),
    'cycles', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'matter_id', c.matter_id, 'stage', c.stage, 'kind', c.kind))
      from public.response_cycles c where c.status = 'open'), '[]'::jsonb),
    'deadlines', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'matter_id', d.matter_id, 'title', d.title, 'kind', d.kind, 'due_date', d.due_date,
                                          'raw_due_date', d.raw_due_date, 'attorney_verified', d.attorney_verified, 'rule_code', d.rule_code)
                       order by d.due_date)
      from public.deadlines d where d.status = 'open'), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(jsonb_build_object('matter_id', i.matter_id, 'label', i.label))
      from public.checklist_items i where i.third_party_draft and i.status in ('drafted', 'attorney_review') and i.voided_at is null), '[]'::jsonb),
    'untold', coalesce((
      select jsonb_agg(jsonb_build_object('matter_id', f.matter_id, 'form_type', f.form_type, 'decision', f.decision))
      from public.filings f where f.decision is not null and f.client_informed_at is null and f.voided_at is null), '[]'::jsonb),
    'last_activity', coalesce((
      select jsonb_object_agg(e.matter_id, e.last_at)
      from (select matter_id, max(occurred_at) as last_at from public.event_log where matter_id is not null group by matter_id) e), '{}'::jsonb),
    'stalled_days', (select s.value from public.settings s where s.key = 'dashboard.stalled_days'),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'matter_id', t.matter_id, 'title', t.title, 'owner_role', t.owner_role, 'due_date', t.due_date)
                       order by t.due_date nulls last)
      from public.tasks t where t.status = 'open'), '[]'::jsonb),
    'sweep', public.sweep_data(),
    -- Evidence still to collect, for the paralegal and docketing view.
    'evidence_open', coalesce((
      select jsonb_agg(jsonb_build_object('matter_id', i.matter_id, 'label', i.label, 'owner', i.owner, 'status', i.status)
                       order by i.created_at)
      from public.checklist_items i
      join public.matters m on m.id = i.matter_id and m.status in ('prospect', 'active')
      where i.status in ('needed', 'requested') and i.voided_at is null), '[]'::jsonb)
  );
$$;
