-- Closing or declining a matter also withdraws its unreviewed AI drafts
-- (found in the phone check, Nov 14): a draft on a closed matter can't be
-- reviewed (the matter is frozen), so it stayed on the attorney's "Needs your
-- approval" list for good. It is now marked rejected, with the reason, and
-- kept in the record like every other draft.

create or replace function public.matter_end_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('closed', 'declined') and old.status is distinct from new.status then
    update public.tasks set status = 'cancelled'
    where matter_id = new.id and status = 'open';
    update public.client_messages
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
        cancel_reason = 'The matter was ' || new.status::text
    where matter_id = new.id and status = 'waiting';
    update public.drafts
    set status = 'rejected', review_note = 'Not reviewed: the matter was ' || new.status::text, reviewed_at = now()
    where matter_id = new.id and status in ('pending_review', 'changes_requested');
  end if;
  return null;
end;
$$;

-- Matters closed or declined before this rule.
update public.drafts x
set status = 'rejected', review_note = 'Not reviewed: the matter was ' || m.status::text, reviewed_at = now()
from public.matters m
where m.id = x.matter_id and m.status in ('closed', 'declined') and x.status in ('pending_review', 'changes_requested');
