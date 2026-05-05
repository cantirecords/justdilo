alter table tasks
  add column if not exists reminder_minutes integer default null,
  add column if not exists reminded_at timestamptz default null;
