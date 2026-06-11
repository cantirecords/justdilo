-- Track when a task was last touched so notification crons can avoid
-- nudging tasks the user is already engaging with (rescheduling, editing).

alter table public.tasks
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.tasks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.tasks_set_updated_at();

-- Feature flag gating the "skip recently-touched tasks" behavior in the
-- morning brief and stuck nudge crons.
insert into public.feature_flags (key, description, rollout) values
  ('smart_notification_suppress', 'Skip morning brief / stuck nudges for tasks edited in the last 12h', 'admin')
on conflict (key) do nothing;

update public.feature_flags
   set category   = 'Notifications',
       how_to_use  = 'When on for a user, the morning brief and 3-day stuck nudge ignore any task whose updated_at is within the last 12 hours. Postponing, editing the title, or changing the due date all count — so if you just touched it, you won''t get bugged about it.',
       impact      = 'Stops the "I already rescheduled this, stop pinging me" frustration. Pair with the reschedule-resets-reminded_at fix so custom reminders fire fresh after a postpone.',
       location    = 'app/api/push/morning/route.ts (morning brief + stuck nudge, per-user check via get_enabled_features). Deliberately NOT applied to hourly due-soon reminders — those must still fire for just-rescheduled tasks.'
 where key = 'smart_notification_suppress';
