-- JustDilo schema
create extension if not exists "pgcrypto";

create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audio_url text,
  transcript text,
  raw_input text,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid references captures(id) on delete set null,
  title text not null,
  group_name text,
  summary text,
  due_date timestamptz,
  priority text check (priority in ('low','med','high')),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_due_idx on tasks(user_id, due_date);
create index if not exists tasks_user_created_idx on tasks(user_id, created_at desc);
create index if not exists captures_user_idx on captures(user_id, created_at desc);

-- RLS
alter table captures enable row level security;
alter table tasks enable row level security;

create policy "captures owner all" on captures for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks owner all" on tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage bucket for audio
insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

create policy "captures storage owner read" on storage.objects for select
  using (bucket_id = 'captures' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "captures storage owner write" on storage.objects for insert
  with check (bucket_id = 'captures' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "captures storage owner delete" on storage.objects for delete
  using (bucket_id = 'captures' and auth.uid()::text = (storage.foldername(name))[1]);
