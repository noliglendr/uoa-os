-- Faster reads. Nothing about who may see or change what is different.
--
-- 1. Row-level security checks the user's role once per query, not once per
--    row: wrapping the call in (select ...) lets Postgres evaluate it one time.
-- 2. Indexes on matter_id, so loading one matter doesn't scan whole tables.
-- 3. One call per screen (dashboard_data, matter_page, sweep_data) instead of
--    10-16 separate requests. They run as the signed-in user (security
--    invoker), so row-level security still applies to every row.

-- ---------------------------------------------------------------------------
-- 1. Policies: same rules, evaluated once per query
-- ---------------------------------------------------------------------------
alter policy profiles_select on public.profiles
  using ((select public.current_app_role()) is not null);
alter policy profiles_update_principal on public.profiles
  using ((select public.has_role(array['principal']::public.app_role[])))
  with check ((select public.has_role(array['principal']::public.app_role[])));
alter policy event_log_select on public.event_log
  using ((select public.current_app_role()) is not null);
alter policy settings_select on public.settings
  using ((select public.current_app_role()) is not null);
alter policy settings_update_principal on public.settings
  using ((select public.has_role(array['principal']::public.app_role[])))
  with check ((select public.has_role(array['principal']::public.app_role[])));

do $$
declare t text;
begin
  foreach t in array array['matters', 'parties', 'filings', 'response_cycles', 'appearances', 'gates',
                           'checklist_items', 'deadline_rules', 'notices', 'deadlines', 'tasks', 'escalations'] loop
    execute format('alter policy %I on public.%I using ((select public.current_app_role()) is not null)', t || '_select', t);
  end loop;
  foreach t in array array['matters', 'parties', 'filings', 'appearances', 'checklist_items', 'deadlines', 'tasks', 'deadline_rules'] loop
    execute format('alter policy %I on public.%I using ((select public.current_app_role()) is not null) with check ((select public.current_app_role()) is not null)',
                   t || '_update', t);
  end loop;
  foreach t in array array['matters', 'parties', 'filings', 'appearances', 'checklist_items', 'deadlines', 'tasks'] loop
    execute format('alter policy %I on public.%I with check ((select public.current_app_role()) is not null)', t || '_insert', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
create index parties_matter_idx on public.parties (matter_id);
create index filings_matter_idx on public.filings (matter_id);
create index response_cycles_matter_idx on public.response_cycles (matter_id);
create index appearances_matter_idx on public.appearances (matter_id);
create index gates_matter_idx on public.gates (matter_id);
create index checklist_items_matter_idx on public.checklist_items (matter_id);
create index notices_matter_idx on public.notices (matter_id);
create index deadlines_matter_idx on public.deadlines (matter_id, due_date);
create index deadlines_notice_idx on public.deadlines (notice_id);
create index tasks_open_idx on public.tasks (matter_id, due_date) where status = 'open';
create index event_log_type_idx on public.event_log (event_type, entity_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 3. One call per screen
-- ---------------------------------------------------------------------------

-- Weekly sweep: open matters, filed-but-undecided filings, last check per item.
create function public.sweep_data()
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
      from public.filings f where f.filed_at is not null and f.decision is null), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object('entity_id', c.entity_id, 'occurred_at', c.occurred_at, 'actor_id', c.actor_id, 'payload', c.payload))
      from (
        select distinct on (e.entity_id) e.entity_id, e.occurred_at, e.actor_id, e.payload
        from public.event_log e
        where e.event_type = 'sweep.checked'
        order by e.entity_id, e.occurred_at desc
      ) c), '[]'::jsonb)
  );
$$;

-- Dashboard ("My work").
create function public.dashboard_data()
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
    'sweep', public.sweep_data()
  );
$$;

-- Everything the matter page shows, in one call.
create function public.matter_page(p_matter uuid)
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
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'role', p.role)) from public.profiles p), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label, 'kind', r.kind, 'days', r.days, 'attorney_verified', r.attorney_verified)
                       order by r.code)
      from public.deadline_rules r), '[]'::jsonb)
  ) end
  from (select 1) one
  left join public.matters m on m.id = p_matter;
$$;

revoke execute on function public.sweep_data() from public, anon;
revoke execute on function public.dashboard_data() from public, anon;
revoke execute on function public.matter_page(uuid) from public, anon;
grant execute on function public.sweep_data() to authenticated;
grant execute on function public.dashboard_data() to authenticated;
grant execute on function public.matter_page(uuid) to authenticated;
