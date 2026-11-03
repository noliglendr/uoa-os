-- Explicit table grants.
-- The Supabase project has "Automatically expose new tables" turned off, so no
-- table is reachable through the Data API unless a migration grants it here.
-- Row-level security still decides which rows each user sees.

grant usage on schema public to authenticated, service_role;

-- The server (service role) creates staff profiles and runs scheduled jobs.
-- The event log stays append-only for it too (blocked by triggers).
grant select, insert, update on public.profiles to service_role;
grant select on public.event_log to service_role;
grant select, update on public.settings to service_role;
grant execute on function public.log_event(text, text, text, uuid, jsonb) to service_role;

grant select on public.profiles to authenticated;
-- Staff can change only these fields (and RLS limits it to the principal).
revoke update on public.profiles from authenticated;
grant update (display_name, role, active) on public.profiles to authenticated;

grant select on public.event_log to authenticated;

grant select on public.settings to authenticated;
grant update (value) on public.settings to authenticated;

grant execute on function public.log_event(text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;
grant execute on function public.is_mfa_verified() to authenticated;
