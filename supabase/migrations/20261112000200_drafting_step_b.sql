-- AI drafting, Step B (docs/increment3-plan.md section 7; decision #32):
-- RFE / NOID response outlines and statement drafts. Unlike Step A, these
-- send case facts to the AI (the issues in the notice, checklist items, facts
-- typed by staff), so they sit behind their own switch, drafting.case_facts
-- (D24), off by default and changed by the principal only. Until Frank decides
-- D9 and the vendor's no-training terms are signed, it is used on made-up
-- matters only. Drafts still wait for the attorney; nothing is filed or sent.

-- ---------------------------------------------------------------------------
-- Setting (D24) and its guard
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description, decision) values
  ('drafting.case_facts', 'false',
   'Step B AI drafts (RFE/NOID response outlines, statement drafts) send case facts to the AI. Only the principal can turn this on: made-up matters only until D9 and the vendor''s no-training terms.', 'D24');

create or replace function public.drafting_setting_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key in ('drafting.enabled', 'drafting.case_facts') and new.value is distinct from old.value
     and auth.uid() is not null and not public.has_role(array['principal']::public.app_role[]) then
    raise exception 'Only the principal can turn AI drafts on or off' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Templates (the attorney approves each one). [Square blanks] stay for staff
-- or are filled by UOA OS; {{double braces}} are where the AI writes.
-- ---------------------------------------------------------------------------
insert into public.draft_templates (kind, label, body) values
  ('response_outline', 'RFE / NOID response outline', $t$RESPONSE OUTLINE: [NOTICE TYPE] on Form [FORM TYPE]
DRAFT FOR THE ATTORNEY. Not for filing.
Response due: [RESPONSE DUE]

1. Introduction
   - Who we represent: [CLIENT NAME]
   - What we respond to, and what is enclosed.

2. Issues raised in the notice
{{ONE NUMBERED SECTION PER ISSUE: a. What the agency asked for. b. Evidence we will submit. c. Points to make: [ATTORNEY TO WRITE ARGUMENT]. d. Gaps or risks: [ATTORNEY TO CHECK]}}

3. Exhibit list
[EXHIBIT LIST]

4. Before filing
   - Attorney review, signature and G-28 on file
   - A copy of the notice on top of the response
   - Filed before [RESPONSE DUE]$t$),
  ('statement_draft', 'Statement draft', $t$STATEMENT OF [DECLARANT NAME]
DRAFT FOR THE ATTORNEY. The person must read, correct and confirm every fact before signing.

I, [DECLARANT NAME], state as follows:

{{SHORT NUMBERED PARAGRAPHS IN THE PERSON'S OWN VOICE, FROM THE FACTS GIVEN ONLY}}

[DECLARATION LANGUAGE: ATTORNEY TO INSERT]

[SIGNATURE]
[SIGNING DATE]$t$);

-- ---------------------------------------------------------------------------
-- Drafts: which response cycle, and what staff typed (kept for the review).
-- ---------------------------------------------------------------------------
alter table public.drafts
  add column cycle_id uuid references public.response_cycles (id),
  add column inputs jsonb;

comment on column public.drafts.inputs is
  'Step B: what staff typed for the AI (notice issues, or statement facts). Shown to the attorney with the draft.';

-- Step B kinds need the case-facts switch on (D24).
create or replace function public.draft_start_check(p_matter uuid, p_kind text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.drafting_role_check();
  perform public.draft_matter_open_check(p_matter);
  if (select s.value from public.settings s where s.key = 'drafting.enabled') is distinct from 'true'::jsonb then
    raise exception 'AI drafts are off. The principal can turn them on in Settings' using errcode = 'check_violation';
  end if;
  if p_kind in ('response_outline', 'statement_draft')
     and (select s.value from public.settings s where s.key = 'drafting.case_facts') is distinct from 'true'::jsonb then
    raise exception 'Case facts to the AI are off (D24). The principal can turn them on in Settings, for made-up matters only until D9'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.draft_templates t where t.kind = p_kind and t.attorney_approved) then
    raise exception 'The attorney must approve this template first (Templates page)' using errcode = 'check_violation';
  end if;
end;
$$;

drop function public.create_draft(uuid, text, uuid, text, text);

create function public.create_draft(p_matter uuid, p_kind text, p_filing uuid, p_body text, p_model text,
                                    p_cycle uuid default null, p_inputs jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.draft_start_check(p_matter, p_kind);
  perform public.draft_personal_data_check(p_body);
  perform public.draft_personal_data_check(coalesce(p_inputs::text, ''));
  if p_filing is not null and not exists (
       select 1 from public.filings f where f.id = p_filing and f.matter_id = p_matter and f.voided_at is null) then
    raise exception 'That filing is not on this matter' using errcode = 'check_violation';
  end if;
  if p_cycle is not null and not exists (
       select 1 from public.response_cycles c where c.id = p_cycle and c.matter_id = p_matter) then
    raise exception 'That response is not on this matter' using errcode = 'check_violation';
  end if;
  if p_kind = 'response_outline' and p_cycle is null then
    raise exception 'Choose the RFE or NOID response' using errcode = 'check_violation';
  end if;
  insert into public.drafts (matter_id, filing_id, cycle_id, kind, template_version, body, original_body, model, requested_by, inputs)
  select p_matter, p_filing, p_cycle, t.kind, t.version, p_body, p_body, p_model, auth.uid(), p_inputs
  from public.draft_templates t where t.kind = p_kind
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_draft(uuid, text, uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_draft(uuid, text, uuid, text, text, uuid, jsonb) to authenticated;
