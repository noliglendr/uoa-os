-- Minimal stand-in for Supabase's auth schema and roles. Local and CI tests only.
-- Roles may already exist in the cluster; they are created only when missing.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id),
                               factor_type text not null default 'totp', status text not null default 'unverified');
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
