-- Closing or declining a matter ends its leftover work (found in the live
-- test, Nov 11): open tasks are cancelled, so they leave "My tasks" and the
-- overdue follow-ups, and waiting client messages are cancelled, so the
-- outbox holds nothing that can no longer be sent. Both are logged, as
-- system changes caused by the closing.

create function public.matter_end_cleanup()
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
  end if;
  return null;
end;
$$;

create trigger matters_end_cleanup after update of status on public.matters
  for each row execute function public.matter_end_cleanup();

revoke execute on function public.matter_end_cleanup() from public, anon, authenticated;

-- Matters closed or declined before this rule.
update public.tasks t set status = 'cancelled'
from public.matters m
where m.id = t.matter_id and m.status in ('closed', 'declined') and t.status = 'open';

update public.client_messages x
set status = 'cancelled', cancelled_at = now(), cancel_reason = 'The matter was ' || m.status::text
from public.matters m
where m.id = x.matter_id and m.status in ('closed', 'declined') and x.status = 'waiting';
