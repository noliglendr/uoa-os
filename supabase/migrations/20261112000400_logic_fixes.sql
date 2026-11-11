-- Logic fixes from the second review of the live system (decision #34).
--   L1 Receipts: the stage 7 rule is "log the receipt within 1 business day
--      of receiving it". USCIS receipts arrive 2-4 weeks after filing, so the
--      "no receipt yet" follow-up now waits followup.receipt_business_days = 15
--      business days after filing (about 3 weeks) instead of 1.
--   L2 Invoices: a fee phase is billed once per matter (a bundle of 4 forms is
--      one filing phase). Only "response filed" repeats, once per response.
--   L3 Stage 6: every client needs an open appearance in the forum of every
--      filing (redline 6), not just any appearance.
--   L4 Stage 10: only the attorney records the post-decision step, and a
--      motion or appeal needs an open deadline on the calendar first.
--   L5 Dates: the database's "today" is the firm's day (Texas), not UTC.

-- L5: firm time for current_date and now()::date (new sessions).
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Chicago');
end $$;
set timezone to 'America/Chicago';

-- L1
update public.settings
set value = '15',
    description = 'Follow up on a filed filing with no receipt after this many business days (USCIS receipts usually arrive 2-4 weeks after filing). Once a receipt arrives, log it within 1 business day (stage 7).'
where key = 'followup.receipt_business_days' and value = '1'::jsonb;

-- L2
create or replace function public.invoice_on_event()
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
    -- Once per matter per fee phase; each response is its own phase.
    and (v_trigger = 'response' or not exists (
          select 1 from public.invoices i where i.matter_id = new.matter_id and i.fee_phase_id = f.id and i.status <> 'void'))
  on conflict do nothing;
  return null;
end;
$$;

-- L3
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
      -- Redline 6: the appearance must be for the forum of each filing (a G-28
      -- does not cover the immigration court, an EOIR-28 does not cover the BIA).
      item := 'Appearance form on file for every client, in the forum of every filing';
      ok := not exists (select 1 from public.parties p
                        join public.filings f on f.matter_id = p.matter_id and f.cycle_id is null and f.voided_at is null
                        where p.matter_id = p_matter and p.is_client and p.voided_at is null
                          and not exists (select 1 from public.appearances a
                                          where a.party_id = p.id and a.status = 'open' and a.forum = f.forum))
            and not exists (select 1 from public.parties p
                            where p.matter_id = p_matter and p.is_client and p.voided_at is null
                              and not exists (select 1 from public.appearances a where a.party_id = p.id and a.status = 'open'));
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

-- L4
create or replace function public.filings_lifecycle()
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
  -- Stage 10 is the attorney's decision, and a motion or appeal needs its hard
  -- deadline on the calendar first (framework stage 10), so it can't be missed.
  if new.post_decision is not null and (v_old ->> 'post_decision') is null then
    perform public.require_attorney('record the post-decision step');
    if new.post_decision in ('motion', 'appeal') and not exists (
         select 1 from public.deadlines d
         where d.matter_id = new.matter_id and d.status = 'open' and d.kind = 'response' and d.voided_at is null
           and d.due_date >= (now() at time zone 'America/Chicago')::date) then
      raise exception 'Add the % deadline first (Overview, Add a deadline): a motion or appeal needs its hard deadline on the calendar', new.post_decision
        using errcode = 'check_violation';
    end if;
  end if;
  -- The receipt number arrives after filing: entering it logs the receipt.
  if new.receipt_logged_at is null and (v_old ->> 'filed_at') is not null
     and nullif(trim(new.ref_no), '') is not null and new.ref_no is distinct from (v_old ->> 'ref_no') then
    new.receipt_logged_at := now();
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
