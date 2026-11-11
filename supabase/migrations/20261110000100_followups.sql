-- Increment 4, Step 1: staff follow-ups (docs/increment4-plan.md, decision #28).
-- Things that are late or stuck inside the firm become follow-ups in "My work"
-- and one daily email per person. Nothing goes to clients; no client data.
--   * Receipt not logged: a filed filing has no receipt (or proof) logged
--     within followup.receipt_business_days business days (stage 7 rule).
--   * Stalled matter: nothing logged for dashboard.stalled_days days.
--   * Overdue task: an open task past its due date.
-- The rules live in src/lib/followups.ts; the daily job is /api/cron/escalations.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description, decision) values
  ('followup.receipt_business_days', '1',
   'A filed filing needs its receipt or proof of filing logged within this many business days (stage 7).', null),
  ('followup.emails', 'true',
   'Daily follow-up email to staff (receipts not logged, stalled matters, overdue tasks). Staff only, never clients.', null);

-- ---------------------------------------------------------------------------
-- Follow-up emails sent: one row per item per day, so nothing is sent twice.
-- recipients is a count: staff email addresses stay in Supabase Auth.
-- ---------------------------------------------------------------------------
create table public.followups_sent (
  id         bigint generated always as identity primary key,
  item_key   text not null check (item_key ~ '^(receipt|stalled|task):'),
  matter_id  uuid references public.matters (id),
  sent_on    date not null,
  sent_at    timestamptz not null default now(),
  recipients integer not null check (recipients >= 0),
  delivered  boolean not null,
  failed     boolean not null default false,
  detail     text,
  unique (item_key, sent_on)
);

comment on table public.followups_sent is
  'Daily follow-up emails to staff (Increment 4, Step 1). delivered = false in a dry run; failed = refused by the email service (retried next run).';

alter table public.followups_sent enable row level security;
create policy followups_sent_select on public.followups_sent
  for select to authenticated using ((select public.current_app_role()) is not null);
revoke all on public.followups_sent from anon, authenticated;
grant select on public.followups_sent to authenticated;
grant select, insert, update on public.followups_sent to service_role;

create trigger followups_sent_no_delete before delete on public.followups_sent
  for each row execute function public.block_delete();
create trigger followups_sent_no_truncate before truncate on public.followups_sent
  for each statement execute function public.block_delete();

-- Filed filings with no receipt logged yet, on open matters.
create function public.awaiting_receipt()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'matter_id', f.matter_id, 'form_type', f.form_type,
                                        'forum', f.forum, 'filed_at', f.filed_at) order by f.filed_at)
    from public.filings f
    join public.matters m on m.id = f.matter_id and m.status in ('prospect', 'active')
    where f.filed_at is not null and f.receipt_logged_at is null and f.voided_at is null), '[]'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- Data for the daily job (service role only). Last activity counts staff
-- events only, so reminder emails never make a stalled matter look active.
-- ---------------------------------------------------------------------------
create function public.followup_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', coalesce((
      select jsonb_object_agg(s.key, s.value) from public.settings s
      where s.key in ('followup.receipt_business_days', 'followup.emails', 'dashboard.stalled_days')), '{}'::jsonb),
    'matters', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'code', m.code, 'stage', m.stage, 'attorney_id', m.attorney_id,
                                          'last', coalesce((select max(e.occurred_at) from public.event_log e
                                                            where e.matter_id = m.id and e.actor_id is not null), m.stage_changed_at)))
      from public.matters m where m.status in ('prospect', 'active')), '[]'::jsonb),
    'awaiting_receipt', public.awaiting_receipt(),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'matter_id', t.matter_id, 'title', t.title, 'owner_role', t.owner_role, 'due_date', t.due_date))
      from public.tasks t join public.matters m on m.id = t.matter_id and m.status in ('prospect', 'active')
      where t.status = 'open' and t.due_date is not null), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object('key', f.item_key, 'sent_on', f.sent_on))
      from public.followups_sent f where not f.failed and f.sent_on > current_date - 30), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'role', p.role)) from public.profiles p where p.active), '[]'::jsonb)
  );
$$;

revoke execute on function public.followup_data() from public, anon, authenticated;
grant execute on function public.followup_data() to service_role;
revoke execute on function public.awaiting_receipt() from public, anon;
grant execute on function public.awaiting_receipt() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- "My work": add the receipt follow-ups and their setting.
-- ---------------------------------------------------------------------------
-- Last activity now counts staff events only (reminder emails are system events).
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
      from (select matter_id, max(occurred_at) as last_at from public.event_log
            where matter_id is not null and actor_id is not null group by matter_id) e), '{}'::jsonb),
    'stalled_days', (select s.value from public.settings s where s.key = 'dashboard.stalled_days'),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'matter_id', t.matter_id, 'title', t.title, 'owner_role', t.owner_role, 'due_date', t.due_date)
                       order by t.due_date nulls last)
      from public.tasks t where t.status = 'open'), '[]'::jsonb),
    'awaiting_receipt', public.awaiting_receipt(),
    'receipt_days', (select s.value from public.settings s where s.key = 'followup.receipt_business_days'),
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
