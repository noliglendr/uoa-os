-- One database call for each remaining screen (Staff, Deadline rules, Weekly
-- sweep, Settings), so each page waits for one round trip instead of several.

-- Staff: the people list, plus email, two-step status and last sign-in from
-- Supabase Auth. Auth data is shown to the principal only (as before); other
-- staff get names and roles. Someone with no active role gets nothing.
create function public.staff_page()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.current_app_role() is null then '[]'::jsonb else coalesce((
    select jsonb_agg(
             jsonb_build_object('id', p.id, 'display_name', p.display_name, 'role', p.role, 'active', p.active, 'created_at', p.created_at)
             || case when public.has_role(array['principal']::public.app_role[]) then jsonb_build_object(
                  'email', u.email,
                  'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
                  'last_sign_in_at', u.last_sign_in_at)
                else '{}'::jsonb end
             order by p.created_at)
    from public.profiles p
    left join auth.users u on u.id = p.id), '[]'::jsonb) end;
$$;

-- Staff names, used to show who verified a rule, checked a case or changed a setting.
create function public.staff_names()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select jsonb_object_agg(p.id, p.display_name) from public.profiles p), '{}'::jsonb);
$$;

create function public.rules_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.code) from public.deadline_rules r), '[]'::jsonb),
    'names', public.staff_names());
$$;

create function public.settings_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', coalesce((select jsonb_agg(to_jsonb(s) order by s.key) from public.settings s), '[]'::jsonb),
    'names', public.staff_names());
$$;

-- The weekly sweep page also shows who did each check.
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
      from public.filings f where f.filed_at is not null and f.decision is null), '[]'::jsonb),
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

do $$
declare f text;
begin
  foreach f in array array['staff_page()', 'staff_names()', 'rules_page()', 'settings_page()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
