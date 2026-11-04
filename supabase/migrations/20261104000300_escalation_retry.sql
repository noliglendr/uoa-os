-- A reminder the email service refused is retried on the next run (R2).
-- Before this, a refused email was recorded like a sent one and never retried.

alter table public.escalations add column failed boolean not null default false;
comment on column public.escalations.failed is
  'The email service refused the reminder: it is retried on the next run. A dry run is not a failure.';

update public.escalations set failed = true where not delivered and detail like 'email service error%';

-- Every attempt is logged, including retries (which update the row).
create or replace function public.escalations_matter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_event(
    case when new.failed then 'deadline.escalation_failed' else 'deadline.escalated' end,
    'deadline', new.deadline_id::text,
    (select d.matter_id from public.deadlines d where d.id = new.deadline_id),
    jsonb_build_object('days_before', new.days_before, 'recipients', cardinality(new.recipients),
                       'delivered', new.delivered, 'detail', new.detail));
  return null;
end;
$$;

drop trigger escalations_log on public.escalations;
create trigger escalations_log after insert or update on public.escalations
  for each row execute function public.escalations_matter();
