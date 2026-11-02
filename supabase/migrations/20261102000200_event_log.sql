-- Append-only event log.
-- Rule: "If it is not logged, it did not happen." Every change writes a row.
-- Rows can never be updated or deleted, by anyone (the service role included).

create table public.event_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid references public.profiles (id),
  actor_role  public.app_role,
  event_type  text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (entity_type ~ '^[a-z_]+$'),
  entity_id   text,
  matter_id   uuid,
  payload     jsonb not null default '{}'::jsonb
);

comment on table public.event_log is
  'Append-only history of every change: who (actor), what (event_type, entity, payload), when (occurred_at).';
comment on column public.event_log.actor_id is
  'Null only for system events (scheduled jobs). Always set from the session, never from the caller.';
comment on column public.event_log.matter_id is
  'Synthetic matter ID. Foreign key added when the matter table exists.';

create index event_log_matter_idx on public.event_log (matter_id, occurred_at);
create index event_log_entity_idx on public.event_log (entity_type, entity_id, occurred_at);

-- Block every update, delete and truncate.
create function public.event_log_block_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'event_log is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger event_log_no_update
  before update or delete on public.event_log
  for each row execute function public.event_log_block_change();

create trigger event_log_no_truncate
  before truncate on public.event_log
  for each statement execute function public.event_log_block_change();

-- The only way to write an event. The actor and time come from the session,
-- so a caller cannot write an event in someone else's name or backdate it.
create function public.log_event(
  p_event_type  text,
  p_entity_type text,
  p_entity_id   text default null,
  p_matter_id   uuid default null,
  p_payload     jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   bigint;
  v_role public.app_role;
begin
  if auth.uid() is not null then
    v_role := public.current_app_role();
    if v_role is null then
      raise exception 'Only active, MFA-verified staff can log events'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into public.event_log (actor_id, actor_role, event_type, entity_type, entity_id, matter_id, payload)
  values (auth.uid(), v_role, p_event_type, p_entity_type, p_entity_id, p_matter_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.log_event(text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_event(text, text, text, uuid, jsonb) to authenticated;

alter table public.event_log enable row level security;

-- Every active, MFA-verified staff member can read the history.
create policy event_log_select on public.event_log
  for select to authenticated
  using (public.current_app_role() is not null);

-- No insert/update/delete policies: writes go through log_event() only.
revoke insert, update, delete, truncate on public.event_log from anon, authenticated;
revoke all on public.event_log from anon;

-- Log changes to staff profiles (role changes, deactivation).
create function public.profiles_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  perform public.log_event(
    case when tg_op = 'INSERT' then 'user.created' else 'user.updated' end,
    'profile',
    new.id::text,
    null,
    jsonb_build_object(
      'role', new.role,
      'active', new.active,
      'old_role', case when tg_op = 'UPDATE' then old.role end,
      'old_active', case when tg_op = 'UPDATE' then old.active end
    )
  );
  return new;
end;
$$;

create trigger profiles_log_change
  before insert or update on public.profiles
  for each row execute function public.profiles_log_change();
