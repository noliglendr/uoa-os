-- Firm settings.
-- Open client decisions are settings, not hard-coded values (CLAUDE.md section 8).
-- Only the principal can change a setting, and every change is logged.

create table public.settings (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)*$'),
  value       jsonb not null,
  description text not null,
  decision    text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);

comment on column public.settings.decision is
  'Client decision this setting waits on (for example D8), if any.';

insert into public.settings (key, value, description, decision) values
  ('attorney_of_record.default', '"principal"',
   'Attorney of record on every new matter. Override per matter.', null),
  ('delegated_account_access', '"off"',
   'Staff access to the attorney''s USCIS/ECAS accounts: off | prepare_only | submit_after_gate. Off = staff prepare, the attorney submits.', 'D10'),
  ('premium_processing', '{"mode": "ask_per_matter", "default": false}',
   'Premium processing is asked per matter. Default no.', null),
  ('retention.years_after_close', '7',
   'Years to keep a closed file. Never auto-deleted: the file is flagged for attorney review. A legal hold blocks it.', 'D8'),
  ('next_phase_new_matter', 'true',
   'A refile or next phase (adjustment, merits case) opens a new matter.', 'D3'),
  ('deadline.mailing_extension_days', '3',
   'Days added to a response window when the notice was mailed.', 'D7'),
  ('deadline.escalation_days', '[21, 14, 7, 3, 1]',
   'Days before a deadline when the attorney and backup are reminded.', 'D12'),
  ('client_auto_updates', 'false',
   'Automatic template updates to clients. Off in the prototype and pilot.', 'D11');

alter table public.settings enable row level security;

create policy settings_select on public.settings
  for select to authenticated
  using (public.current_app_role() is not null);

create policy settings_update_principal on public.settings
  for update to authenticated
  using (public.has_role(array['principal']::public.app_role[]))
  with check (public.has_role(array['principal']::public.app_role[]));

-- Keys are fixed by migrations: users can change values, not add or remove keys.
revoke insert, delete, truncate on public.settings from anon, authenticated;
revoke all on public.settings from anon;
-- Only the value can be changed; updated_at and updated_by are set by the trigger.
revoke update on public.settings from authenticated;
grant update (value) on public.settings to authenticated;

create function public.settings_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key is distinct from old.key then
    raise exception 'Setting keys cannot be renamed';
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();

  perform public.log_event(
    'setting.changed',
    'setting',
    new.key,
    null,
    jsonb_build_object('old_value', old.value, 'new_value', new.value)
  );
  return new;
end;
$$;

create trigger settings_log_change
  before update on public.settings
  for each row
  when (new.value is distinct from old.value)
  execute function public.settings_log_change();
