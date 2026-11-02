-- Roles and staff profiles.
-- Every app user is a staff member with exactly one role.
-- No client data lives here: profiles are firm staff only.

create type public.app_role as enum (
  'principal',
  'attorney',
  'paralegal',
  'docketing',
  'intake'
);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (length(trim(display_name)) > 0),
  role         public.app_role not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Firm staff. One row per auth user. Created by the principal (invite), never by self sign-up.';

-- True when the current session finished the second factor (MFA).
create function public.is_mfa_verified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Role of the signed-in user, or null if they have no active profile
-- or have not finished MFA. Every access rule goes through this function.
create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active
    and public.is_mfa_verified();
$$;

create function public.has_role(roles public.app_role[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (roles), false);
$$;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.has_role(public.app_role[]) from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;

alter table public.profiles enable row level security;

-- Any active, MFA-verified staff member can see the staff list
-- (needed to show who did what in the event log).
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.current_app_role() is not null);

-- Only the principal can change a role, a name or deactivate someone.
create policy profiles_update_principal on public.profiles
  for update to authenticated
  using (public.has_role(array['principal']::public.app_role[]))
  with check (public.has_role(array['principal']::public.app_role[]));

-- No insert or delete policy: staff are added by the principal through the
-- server (service role), and never deleted, only deactivated.
revoke insert, delete, truncate on public.profiles from anon, authenticated;
revoke all on public.profiles from anon;
