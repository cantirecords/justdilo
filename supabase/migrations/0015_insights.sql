-- Track when tasks are actually completed
alter table public.tasks
  add column if not exists completed_at timestamptz;

-- Auto-set/clear completed_at when completed flips
create or replace function public.tasks_track_completed_at()
returns trigger language plpgsql as $$
begin
  if new.completed and not old.completed then
    new.completed_at = now();
  elsif not new.completed and old.completed then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at_trg
  before update on public.tasks
  for each row execute function public.tasks_track_completed_at();

-- Recurring suggestion: tasks the user recreates manually on a regular cadence
create or replace function public.get_recurring_suggestions(p_user_id uuid)
returns table(
  norm_title     text,
  occurrences    bigint,
  avg_gap_days   numeric,
  suggested_type text,
  sample_title   text
) language sql security definer set search_path = public as $$
  select
    lower(trim(title))                                                    as norm_title,
    count(*)                                                              as occurrences,
    round(
      (extract(epoch from max(created_at) - min(created_at)) / 86400.0)
      / (count(*) - 1),
      1
    )                                                                     as avg_gap_days,
    case
      when (extract(epoch from max(created_at) - min(created_at)) / 86400.0)
           / (count(*) - 1) between 5 and 9   then 'weekly'
      when (extract(epoch from max(created_at) - min(created_at)) / 86400.0)
           / (count(*) - 1) between 25 and 35 then 'monthly'
      else 'custom'
    end                                                                   as suggested_type,
    (array_agg(title order by created_at desc))[1]                        as sample_title
  from public.tasks
  where user_id = p_user_id
    and recurring_type is null
  group by lower(trim(title))
  having count(*) >= 3
    and (extract(epoch from max(created_at) - min(created_at)) / 86400.0)
        / (count(*) - 1) between 5 and 35
  limit 5;
$$;

-- Abandonment stats: how often does this user abandon tasks, split by whether they had a due date
create or replace function public.get_abandonment_stats(p_user_id uuid)
returns table(
  has_due_date   boolean,
  total_aged     bigint,
  abandoned_cnt  bigint,
  abandon_rate   numeric
) language sql security definer set search_path = public as $$
  select
    (due_date is not null)                                                    as has_due_date,
    count(*) filter (where created_at < now() - interval '14 days')           as total_aged,
    count(*) filter (
      where created_at < now() - interval '14 days'
        and not completed
    )                                                                          as abandoned_cnt,
    round(
      100.0
      * count(*) filter (where created_at < now() - interval '14 days' and not completed)
      / nullif(count(*) filter (where created_at < now() - interval '14 days'), 0),
      0
    )                                                                          as abandon_rate
  from public.tasks
  where user_id = p_user_id
    and org_id is null
  group by (due_date is not null)
  having count(*) filter (where created_at < now() - interval '14 days') >= 5;
$$;

-- Priority completion insight: completion rate and speed per priority level
create or replace function public.get_priority_insights(p_user_id uuid)
returns table(
  priority        text,
  total           bigint,
  completed_cnt   bigint,
  completion_pct  numeric,
  avg_days        numeric
) language sql security definer set search_path = public as $$
  select
    priority,
    count(*)                                                             as total,
    count(*) filter (where completed)                                    as completed_cnt,
    round(100.0 * count(*) filter (where completed) / count(*), 0)      as completion_pct,
    round(
      avg(extract(epoch from (completed_at - created_at)) / 86400.0)
        filter (where completed and completed_at is not null),
      1
    )                                                                    as avg_days
  from public.tasks
  where user_id = p_user_id
    and priority is not null
    and org_id is null
  group by priority
  having count(*) >= 5
  order by case priority when 'high' then 0 when 'med' then 1 when 'low' then 2 end;
$$;
