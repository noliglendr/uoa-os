-- AI first drafts, Step A (decisions #22, #23; docs/increment3-plan.md):
-- cover, evidence request and closing letters. A draft comes from a template the
-- attorney approved, holds blanks instead of client details, waits for the
-- attorney, and is frozen once reviewed. The system never sends anything.
-- The AI runs on the server (src/lib/draft-ai.ts); these rules hold whatever calls them.

-- ---------------------------------------------------------------------------
-- Setting (D21): off until the principal decides
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description, decision) values
  ('drafting.enabled', 'false',
   'AI first drafts of letters. Only the principal can change this, after checking the bar rules.', 'D21');

create function public.drafting_setting_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key = 'drafting.enabled' and new.value is distinct from old.value
     and auth.uid() is not null and not public.has_role(array['principal']::public.app_role[]) then
    raise exception 'Only the principal can turn AI drafts on or off' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger settings_drafting_guard before update on public.settings
  for each row execute function public.drafting_setting_guard();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.draft_templates (
  kind              text primary key,
  label             text not null,
  body              text not null check (length(trim(body)) > 0),
  version           integer not null default 1,
  attorney_approved boolean not null default false,
  approved_by       uuid references public.profiles (id),
  approved_at       timestamptz,
  updated_at        timestamptz not null default now()
);

comment on table public.draft_templates is 'Letter templates. No draft is made until the attorney approves the template (decision #22).';

create table public.drafts (
  id               uuid primary key default gen_random_uuid(),
  matter_id        uuid not null references public.matters (id),
  filing_id        uuid references public.filings (id),
  kind             text not null references public.draft_templates (kind),
  template_version integer not null,
  body             text not null check (length(trim(body)) > 0),
  original_body    text not null,
  model            text not null,
  status           text not null default 'pending_review'
                   check (status in ('pending_review', 'changes_requested', 'approved', 'rejected')),
  review_note      text,
  requested_by     uuid references public.profiles (id),
  reviewed_by      uuid references public.profiles (id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.drafts.original_body is 'The text as first generated; body is the current text. Client details stay out (rule R5).';
create index drafts_matter_idx on public.drafts (matter_id);
create index drafts_review_idx on public.drafts (status) where status = 'pending_review';

-- Starter wording, for testing. The attorney replaces and approves each one.
insert into public.draft_templates (kind, label, body) values
  ('cover_letter', 'Filing cover letter', $t$[DATE]

[AGENCY ADDRESS]

Re: [FORM TYPE] filing for [CLIENT NAME]

To whom it may concern:

Our office represents the party named above. Please find enclosed the following:

[ITEM LIST]

Please direct all notices on this matter to our office.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$),
  ('evidence_request', 'Evidence request letter', $t$[DATE]

Dear [CLIENT NAME]:

To continue work on your matter, we need the documents listed below:

[ITEM LIST]

Please send them to our office by [DUE DATE]. If a document is not available, please tell us as soon as you can, so that the attorney can advise you.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$),
  ('closing_letter', 'Closing letter', $t$[DATE]

Dear [CLIENT NAME]:

Our work on your matter is complete, and we are closing our file. It was a privilege to assist you.

Please keep these responsibilities in mind:

- Report any change of address to USCIS within 10 days (Form AR-11).
- Speak with an attorney before international travel.
- [OTHER CLIENT DUTIES, IF ANY]

Please contact our office if you have any questions.

Sincerely,

[ATTORNEY NAME]
UOA Legal$t$);

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

-- A safety net for rule R5: client details are filled in outside UOA OS.
create function public.draft_personal_data_check(p_body text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_body ~ '\mA-?\s?\d{8,9}\M' or p_body ~ '\m[A-Z]{3}\d{10}\M' or p_body ~ '\m\d{3}-\d{2}-\d{4}\M' then
    raise exception 'This looks like an A-number, receipt number or Social Security number. Leave client details as blanks: they are filled in outside UOA OS'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Only the attorney changes or approves a template. New wording needs a new approval.
create function public.draft_templates_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    perform public.require_attorney('change a letter template');
    perform public.draft_personal_data_check(new.body);
    new.version := old.version + 1;
    new.attorney_approved := false;
    new.approved_by := null;
    new.approved_at := null;
  elsif new.attorney_approved is distinct from old.attorney_approved then
    perform public.require_attorney('approve a letter template');
    new.approved_by := case when new.attorney_approved then auth.uid() end;
    new.approved_at := case when new.attorney_approved then now() end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger draft_templates_rule before update on public.draft_templates
  for each row execute function public.draft_templates_rule();

-- Reviewed drafts stay as they are.
create function public.drafts_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('approved', 'rejected') then
    raise exception 'This draft was already reviewed, so it can no longer change' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger drafts_frozen before update on public.drafts
  for each row execute function public.drafts_frozen();

create function public.drafting_role_check()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(public.current_app_role()::text, '') not in ('attorney', 'principal', 'paralegal') then
    raise exception 'Only the attorney, principal or paralegal can work on drafts' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create function public.draft_matter_open_check(p_matter uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status public.matter_status;
begin
  select m.status into v_status from public.matters m where m.id = p_matter;
  if v_status is null then
    raise exception 'Matter not found' using errcode = 'no_data_found';
  end if;
  if v_status not in ('prospect', 'active') then
    raise exception 'The matter is %, so it can no longer change', v_status using errcode = 'check_violation';
  end if;
end;
$$;

-- Everything that must be true before a draft is made, so the AI is not paid for a refused draft.
create function public.draft_start_check(p_matter uuid, p_kind text)
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
  if not exists (select 1 from public.draft_templates t where t.kind = p_kind and t.attorney_approved) then
    raise exception 'The attorney must approve this letter template first (Letter templates page)' using errcode = 'check_violation';
  end if;
end;
$$;

create function public.create_draft(p_matter uuid, p_kind text, p_filing uuid, p_body text, p_model text)
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
  if p_filing is not null and not exists (
       select 1 from public.filings f where f.id = p_filing and f.matter_id = p_matter and f.voided_at is null) then
    raise exception 'That filing is not on this matter' using errcode = 'check_violation';
  end if;
  insert into public.drafts (matter_id, filing_id, kind, template_version, body, original_body, model, requested_by)
  select p_matter, p_filing, t.kind, t.version, p_body, p_body, p_model, auth.uid()
  from public.draft_templates t where t.kind = p_kind
  returning id into v_id;
  return v_id;
end;
$$;

-- An edit goes back to the attorney. History keeps the old text.
create function public.edit_draft(p_draft uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matter uuid;
begin
  perform public.drafting_role_check();
  select x.matter_id into v_matter from public.drafts x where x.id = p_draft;
  if v_matter is null then
    raise exception 'Draft not found' using errcode = 'no_data_found';
  end if;
  perform public.draft_matter_open_check(v_matter);
  perform public.draft_personal_data_check(p_body);
  update public.drafts set body = p_body, status = 'pending_review' where id = p_draft;
end;
$$;

create function public.review_draft(p_draft uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matter uuid;
  v_status text;
begin
  perform public.require_attorney('review a draft');
  if p_decision not in ('approved', 'changes_requested', 'rejected') then
    raise exception 'Choose approve, send back or reject' using errcode = 'check_violation';
  end if;
  if p_decision <> 'approved' and coalesce(trim(p_note), '') = '' then
    raise exception 'Write a short note saying why' using errcode = 'check_violation';
  end if;
  select x.matter_id, x.status into v_matter, v_status from public.drafts x where x.id = p_draft;
  if v_matter is null then
    raise exception 'Draft not found' using errcode = 'no_data_found';
  end if;
  if v_status <> 'pending_review' then
    raise exception 'This draft is not waiting for review' using errcode = 'check_violation';
  end if;
  perform public.draft_matter_open_check(v_matter);
  update public.drafts
  set status = p_decision, review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_draft;
end;
$$;

-- ---------------------------------------------------------------------------
-- Log, no deletes, access
-- ---------------------------------------------------------------------------
create trigger drafts_log after insert or update on public.drafts
  for each row execute function public.log_row_change('draft');
create trigger draft_templates_log after update on public.draft_templates
  for each row execute function public.log_row_change('draft_template', 'kind');

do $$
declare t text;
begin
  foreach t in array array['draft_templates', 'drafts'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.block_delete()',
                   t || '_no_delete', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.block_delete()',
                   t || '_no_truncate', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.current_app_role() is not null)',
                   t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
  end loop;
end $$;

create policy draft_templates_update on public.draft_templates for update to authenticated
  using (public.current_app_role() is not null) with check (public.current_app_role() is not null);
grant update (body, attorney_approved) on public.draft_templates to authenticated;

do $$
declare f text;
begin
  foreach f in array array['draft_personal_data_check(text)', 'drafting_role_check()', 'draft_matter_open_check(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['draft_start_check(uuid, text)', 'create_draft(uuid, text, uuid, text, text)',
                           'edit_draft(uuid, text)', 'review_draft(uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Page data
-- ---------------------------------------------------------------------------

create or replace function public.matter_page(p_matter uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when m.id is null then null else jsonb_build_object(
    'matter', to_jsonb(m),
    'checks', coalesce((select jsonb_agg(to_jsonb(c)) from public.exit_checks(p_matter) c), '[]'::jsonb),
    'closure', coalesce((select jsonb_agg(to_jsonb(c)) from public.closure_checks(p_matter) c), '[]'::jsonb),
    'gates', coalesce((select jsonb_agg(to_jsonb(g)) from public.gates g where g.matter_id = p_matter), '[]'::jsonb),
    'parties', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.parties p where p.matter_id = p_matter), '[]'::jsonb),
    'appearances', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('successor',
               (select jsonb_build_object('code', s.code) from public.matters s where s.id = a.transferred_to))
             order by a.created_at)
      from public.appearances a where a.matter_id = p_matter), '[]'::jsonb),
    'filings', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.filings f where f.matter_id = p_matter), '[]'::jsonb),
    'cycles', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.response_cycles c where c.matter_id = p_matter), '[]'::jsonb),
    'cycle_checks', coalesce((
      select jsonb_object_agg(c.id, coalesce((select jsonb_agg(to_jsonb(x)) from public.exit_checks(p_matter, c.id) x), '[]'::jsonb))
      from public.response_cycles c where c.matter_id = p_matter and c.status = 'open'), '{}'::jsonb),
    'notices', coalesce((select jsonb_agg(to_jsonb(n) order by n.logged_at desc) from public.notices n where n.matter_id = p_matter), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(to_jsonb(d) order by d.due_date) from public.deadlines d where d.matter_id = p_matter), '[]'::jsonb),
    'checklist', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.checklist_items i where i.matter_id = p_matter), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.due_date nulls last)
      from public.tasks t where t.matter_id = p_matter and t.status = 'open'), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
      from (select * from public.event_log e where e.matter_id = p_matter order by e.occurred_at desc limit 300) e), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.drafts x where x.matter_id = p_matter), '[]'::jsonb),
    'draft_templates', coalesce((
      select jsonb_agg(jsonb_build_object('kind', t.kind, 'label', t.label, 'attorney_approved', t.attorney_approved) order by t.kind)
      from public.draft_templates t), '[]'::jsonb),
    'drafting_enabled', (select s.value from public.settings s where s.key = 'drafting.enabled'),
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'role', p.role)) from public.profiles p), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label, 'kind', r.kind, 'days', r.days, 'attorney_verified', r.attorney_verified)
                       order by r.code)
      from public.deadline_rules r), '[]'::jsonb)
  ) end
  from (select 1) one
  left join public.matters m on m.id = p_matter;
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
    'letter_drafts', coalesce((
      select jsonb_agg(jsonb_build_object('matter_id', x.matter_id, 'label', t.label) order by x.created_at)
      from public.drafts x join public.draft_templates t on t.kind = x.kind
      where x.status = 'pending_review'), '[]'::jsonb),
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
