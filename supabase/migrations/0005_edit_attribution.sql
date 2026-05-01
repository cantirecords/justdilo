-- Add display nickname to profiles
alter table profiles add column if not exists nickname text;

-- Add edit attribution to ideas
alter table ideas add column if not exists last_edited_by_id uuid references auth.users(id);
alter table ideas add column if not exists last_edited_at timestamptz;
alter table ideas add column if not exists last_edited_by_nickname text;
