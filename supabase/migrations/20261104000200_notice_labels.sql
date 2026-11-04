-- Readable notice names in task and deadline titles: "Review RFE notice",
-- not "Review rfe notice". Other types stay lower case mid-sentence.

create function public.notice_label(p_type public.notice_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'rfe' then 'RFE'
    when 'noid' then 'NOID'
    else p_type::text
  end;
$$;

-- Log a notice and its deadline in one transaction (R1).
-- p_deadline: {rule_code, kind, title, trigger_date, raw_due_date, due_date,
--              mailing_extension, attendee, prep_date}, computed by the
--              server's deadline module. Null = no deadline: the attorney's
--              reason is recorded, or (other staff) an attorney review is created.
create or replace function public.log_notice(
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
    values (p_matter, p_filing, v_notice, 'review', 'Attorney: set a deadline or record "no deadline" for this ' || public.notice_label(p_type) || ' notice',
            coalesce(p_review_due, public.next_business_day(current_date + 1)));
  end if;

  -- Route the notice the same day (redline 8).
  insert into public.tasks (matter_id, notice_id, title, owner_role, due_date)
  values (p_matter, v_notice,
          'Review ' || public.notice_label(p_type) || ' notice' || case when v_routed = 'docketing' then ' (attorney informed)' else '' end,
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

-- Tasks already logged with the old wording.
update public.tasks t
set title = 'Review ' || public.notice_label(n.notice_type) || ' notice' || coalesce(substring(t.title from ' \(attorney informed\)$'), '')
from public.notices n
where t.notice_id = n.id and n.notice_type in ('rfe', 'noid')
  and t.title ~ ('^Review ' || n.notice_type::text || ' notice');
