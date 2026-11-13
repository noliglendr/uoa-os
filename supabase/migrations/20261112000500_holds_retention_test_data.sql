-- Missing parts found in the full review (decision #36).
--   * Legal hold (D8, "legal hold blocks"): only the attorney places or
--     releases it, and it can change on a closed matter.
--   * Closed and declined matters are frozen: nothing else on them changes.
--   * Test data: every matter so far is made up (R5; D9 pending). They are
--     marked test_data, so after go-live the Firm dashboard counts real work
--     only. Only the principal changes the mark; new matters are real by default.
-- Retention review (7 years, never auto-delete, flag for the attorney) is
-- shown on "My work" from the closing date in the event log.

alter table public.matters add column test_data boolean not null default false;

comment on column public.matters.test_data is
  'Made-up matter (testing, demos, replays). Left out of the Firm dashboard. Set by the principal.';

update public.matters set test_data = true;

grant update (test_data) on public.matters to authenticated;

create function public.matters_record_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- System sessions (seed, scheduled jobs) are trusted; people are checked.
  if auth.uid() is null then
    return new;
  end if;
  if new.legal_hold is distinct from old.legal_hold then
    perform public.require_attorney('place or release a legal hold');
  end if;
  if new.test_data is distinct from old.test_data then
    perform public.require_principal('mark a matter as test data');
  end if;
  if old.status in ('closed', 'declined')
     and (to_jsonb(new) - 'legal_hold' - 'test_data' - 'updated_at')
         is distinct from (to_jsonb(old) - 'legal_hold' - 'test_data' - 'updated_at') then
    raise exception 'This matter is %, so it can no longer change (only its legal hold can)', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger matters_record_guard before update on public.matters
  for each row execute function public.matters_record_guard();

revoke execute on function public.matters_record_guard() from public, anon, authenticated;
