-- Seed: the three walkthrough matters (decision #3). Synthetic only: role labels,
-- TEST- reference numbers, no client facts. Dates are relative to today, so the
-- demo always shows live deadlines.
--
-- Runs as a system session (no signed-in user) through the same functions the
-- app uses, so every stage rule is checked and every step is logged (actor = System).
-- Needs an active principal profile (attorney of record). Safe to run twice.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/seed/matters_abc.sql

do $seed$
declare
  a uuid; b uuid; c uuid;
  f uuid; f130 uuid; f485 uuid; f765 uuid; f131 uuid;
  n uuid; cyc uuid;
  -- Previous business day (weekends only) for prep tasks.
  prep_a date;
begin
  if exists (select 1 from public.matters where code in ('Matter A', 'Matter B', 'Matter C')) then
    raise notice 'Matters A, B and C already exist: nothing to do';
    return;
  end if;
  if not exists (select 1 from public.profiles where role = 'principal' and active) then
    raise exception 'Create the principal account first';
  end if;

  -- -------------------------------------------------------------------------
  -- Matter A: EB-2 NIW petition. Filed, receipted, RFE received; the RFE
  -- response cycle is in evidence build with an expert letter for review.
  -- -------------------------------------------------------------------------
  insert into public.matters (code, summary, matter_type)
  values ('Matter A', 'EB-2 NIW petition (I-140), self-petition', 'petition') returning id into a;
  insert into public.parties (matter_id, label, party_role, conflict_cleared) values (a, 'Client 1', 'petitioner', true);
  perform public.advance_stage(a);
  perform public.approve_gate(a, 2::smallint, null, 'Retainer signed; flat fee; filing fees separate');
  perform public.advance_stage(a);
  perform public.approve_gate(a, 3::smallint, null, 'Strategy memo: NIW three prongs; evidence plan agreed');
  perform public.advance_stage(a);
  insert into public.checklist_items (matter_id, label, owner, status, third_party_draft) values
    (a, 'Expert letter 1', 'third_party', 'approved', true),
    (a, 'Publications and citations', 'client', 'received', false),
    (a, 'Petition letter', 'firm', 'drafted', false);
  perform public.advance_stage(a);
  perform public.approve_gate(a, 5::smallint, null, 'Final review done; packet locked');
  perform public.advance_stage(a);
  insert into public.filings (matter_id, form_type, forum, ref_no) values (a, 'I-140', 'uscis', 'TEST-A-140') returning id into f;
  insert into public.appearances (matter_id, party_id, form, forum, filed_on)
    select a, p.id, 'g28', 'uscis', current_date - 75 from public.parties p where p.matter_id = a;
  perform public.approve_gate(a, 6::smallint, null, 'Signed');
  update public.filings set filed_at = now() - interval '75 days', filing_method = 'courier', fee_cents = 71500, proof_ref = 'TEST-COURIER-1' where id = f;
  perform public.advance_stage(a);
  perform public.log_notice(a, f, 'receipt', 'mail', current_date - 70, current_date - 67, null, null, 'Receipt only; monitoring on');
  n := public.log_notice(a, f, 'rfe', 'mail', current_date - 60, current_date - 56, 'RFE on prong 2',
    jsonb_build_object('rule_code', 'U1', 'kind', 'response', 'title', 'RFE response (I-140)',
                       'trigger_date', current_date - 60, 'raw_due_date', current_date + 24,
                       'due_date', public.next_business_day(current_date + 24)));
  perform public.advance_stage(a);
  cyc := public.open_response_cycle(f, 'rfe', n);
  insert into public.checklist_items (matter_id, cycle_id, label, owner, status, third_party_draft) values
    (a, cyc, 'Updated expert letter', 'third_party', 'drafted', true),
    (a, cyc, 'Response brief', 'firm', 'needed', false),
    (a, cyc, 'New citation evidence', 'client', 'requested', false);

  -- -------------------------------------------------------------------------
  -- Matter B: EOIR motion to reopen. The 90-day clock started before
  -- engagement, so the attorney verified it at intake (redline 3). Engaged;
  -- waiting for the strategy approval.
  -- -------------------------------------------------------------------------
  insert into public.matters (code, summary, matter_type, urgent, engagement_alert_date)
  values ('Matter B', 'Motion to reopen before the immigration court', 'eoir_litigation', true, current_date - 60)
  returning id into b;
  insert into public.parties (matter_id, label, party_role, conflict_cleared) values (b, 'Client 1', 'respondent', true);
  insert into public.deadlines (matter_id, rule_code, kind, title, trigger_date, raw_due_date, due_date, attorney_verified)
  values (b, 'E1', 'response', 'Motion to reopen (90 days from final order)', current_date - 70, current_date + 20,
          public.next_business_day(current_date + 20), true);
  perform public.advance_stage(b);
  perform public.approve_gate(b, 2::smallint, null, 'Retainer signed; motion phase only');
  perform public.advance_stage(b);
  insert into public.checklist_items (matter_id, label, owner, status) values
    (b, 'Record of proceedings (FOIA)', 'firm', 'requested'),
    (b, 'Client declaration', 'client', 'needed'),
    (b, 'Country conditions evidence', 'firm', 'needed');

  -- -------------------------------------------------------------------------
  -- Matter C: spousal adjustment bundle. Two clients (joint representation),
  -- four filings, each receipted; biometrics and interview scheduled.
  -- -------------------------------------------------------------------------
  insert into public.matters (code, summary, matter_type)
  values ('Matter C', 'Spousal adjustment bundle: I-130, I-485, I-765, I-131', 'application') returning id into c;
  insert into public.parties (matter_id, label, party_role, conflict_cleared) values
    (c, 'Client 1', 'petitioner', true),
    (c, 'Client 2', 'beneficiary', true);
  perform public.advance_stage(c);
  perform public.approve_gate(c, 2::smallint, null, 'Joint retainer signed');
  update public.matters set joint_consent = true where id = c;
  perform public.advance_stage(c);
  perform public.approve_gate(c, 3::smallint, null, 'Strategy memo; client duties: AR-11 within 10 days, no travel without advance parole');
  perform public.advance_stage(c);
  insert into public.checklist_items (matter_id, label, owner, status) values
    (c, 'Civil documents (both clients)', 'client', 'received'),
    (c, 'I-693 medical exam', 'third_party', 'received'),
    (c, 'I-864 affidavit of support', 'firm', 'drafted'),
    (c, 'Forms I-130, I-485, I-765, I-131', 'firm', 'drafted');
  perform public.advance_stage(c);
  perform public.approve_gate(c, 5::smallint, null, 'Packet locked; signatures collected');
  perform public.advance_stage(c);
  insert into public.filings (matter_id, form_type, forum, ref_no) values (c, 'I-130', 'uscis', 'TEST-C-130') returning id into f130;
  insert into public.filings (matter_id, form_type, forum, ref_no) values (c, 'I-485', 'uscis', 'TEST-C-485') returning id into f485;
  insert into public.filings (matter_id, form_type, forum, ref_no) values (c, 'I-765', 'uscis', 'TEST-C-765') returning id into f765;
  insert into public.filings (matter_id, form_type, forum, ref_no) values (c, 'I-131', 'uscis', 'TEST-C-131') returning id into f131;
  insert into public.appearances (matter_id, party_id, form, forum, filed_on)
    select c, p.id, 'g28', 'uscis', current_date - 40 from public.parties p where p.matter_id = c;
  perform public.approve_gate(c, 6::smallint, null, 'Signed');
  update public.filings set filed_at = now() - interval '40 days', filing_method = 'mail', proof_ref = 'TEST-MAIL-C'
    where matter_id = c;
  perform public.advance_stage(c);
  perform public.log_notice(c, f130, 'receipt', 'mail', current_date - 33, current_date - 30, null, null, 'Receipt only; monitoring on');
  perform public.log_notice(c, f485, 'receipt', 'mail', current_date - 33, current_date - 30, null, null, 'Receipt only; monitoring on');
  perform public.log_notice(c, f765, 'receipt', 'mail', current_date - 33, current_date - 30, null, null, 'Receipt only; monitoring on');
  perform public.log_notice(c, f131, 'receipt', 'mail', current_date - 33, current_date - 30, null, null, 'Receipt only; monitoring on');
  perform public.advance_stage(c);
  prep_a := current_date + 4;
  prep_a := prep_a - case extract(isodow from prep_a) when 6 then 1 when 7 then 2 else 0 end;
  perform public.log_notice(c, f485, 'biometrics', 'mail', current_date - 5, current_date - 2, null,
    jsonb_build_object('rule_code', 'U5', 'kind', 'appointment', 'title', 'Biometrics appointment',
                       'trigger_date', current_date - 5, 'raw_due_date', current_date + 18, 'due_date', current_date + 18,
                       'attendee', 'Client 2', 'prep_date', prep_a));
  perform public.log_notice(c, f485, 'interview', 'online', current_date - 1, current_date, null,
    jsonb_build_object('rule_code', 'U6', 'kind', 'appointment', 'title', 'Adjustment interview',
                       'trigger_date', current_date - 1, 'raw_due_date', current_date + 45, 'due_date', current_date + 45,
                       'attendee', 'Client 1 and Client 2', 'prep_date', current_date + 31));
  update public.deadlines set attorney_verified = true where matter_id = c and title = 'Biometrics appointment';

  raise notice 'Seeded Matters A, B and C';
end
$seed$;
