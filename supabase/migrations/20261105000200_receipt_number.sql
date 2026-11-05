-- Entering the receipt number of a filed filing logs the receipt (stage 7),
-- as the screen and the test guide say. Before, only a Receipt notice did,
-- so a filing with its receipt number still showed "Receipt logged" as not done.
-- A reference entered before filing does not count: the receipt is logged when
-- the number is entered or changed after the filing was submitted.

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

-- Filings already filed with a receipt number: log the receipt now (test data only so far).
update public.filings set receipt_logged_at = now()
where filed_at is not null and nullif(trim(ref_no), '') is not null and receipt_logged_at is null and voided_at is null;
