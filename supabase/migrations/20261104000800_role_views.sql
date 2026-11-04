-- Role views (decision #17).
-- 1. Intake only opens matters and records conflict checks: the database
--    refuses any other change by an Intake user (notices, deadlines, filings,
--    checklist, appearances, response cycles, tasks), and Intake can move a
--    matter only from stage 1 to stage 2.
-- 2. The dashboard also returns evidence still to collect, for the paralegal
--    and docketing view of "My work".

create function public.block_intake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() = 'intake' then
    raise exception 'Intake opens matters and records conflict checks only. Ask a paralegal or the attorney.'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['notices', 'deadlines', 'filings', 'checklist_items', 'appearances', 'response_cycles', 'tasks'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.block_intake()',
                   t || '_no_intake', t);
  end loop;
end $$;

-- Intake may open a matter and take it from stage 1 to stage 2, nothing later.
create function public.matters_intake_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() = 'intake' and (old.stage > 1 or new.stage > 2) then
    raise exception 'Intake works on new matters (stage 1) only. Ask a paralegal or the attorney.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger matters_intake_limit before update on public.matters
  for each row execute function public.matters_intake_limit();

-- Dashboard ("My work").
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
      from public.checklist_items i where i.third_party_draft and i.status in ('drafted', 'attorney_review')), '[]'::jsonb),
    'untold', coalesce((
      select jsonb_agg(jsonb_build_object('matter_id', f.matter_id, 'form_type', f.form_type, 'decision', f.decision))
      from public.filings f where f.decision is not null and f.client_informed_at is null), '[]'::jsonb),
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
      where i.status in ('needed', 'requested')), '[]'::jsonb)
  );
$$;

