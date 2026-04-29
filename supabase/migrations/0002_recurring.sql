-- Recurring task support
alter table tasks
  add column if not exists recurring_type text
    check (recurring_type in ('daily','weekly','monthly','custom')),
  add column if not exists recurring_interval integer,        -- days between occurrences (custom)
  add column if not exists recurring_day_of_week integer
    check (recurring_day_of_week between 0 and 6),            -- 0=Sunday (weekly)
  add column if not exists recurring_day_of_month integer
    check (recurring_day_of_month between 1 and 31),          -- (monthly)
  add column if not exists recurring_next_due timestamptz,    -- when next instance should fire
  add column if not exists recurring_parent_id uuid
    references tasks(id) on delete set null;                  -- links generated instances to template

create index if not exists tasks_recurring_next_idx
  on tasks(user_id, recurring_next_due)
  where recurring_type is not null and completed = false;
