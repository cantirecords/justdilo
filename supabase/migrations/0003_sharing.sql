-- 1. Profiles table for email-based user lookup
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

drop policy if exists "profiles anyone read" on profiles;
create policy "profiles anyone read" on profiles for select using (true);

-- Auto-create profile on new user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Backfill existing users
insert into profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 2. Ideas table (idempotent — table may already exist in production)
create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  raw_input text not null default '',
  title text,
  summary text,
  sections jsonb not null default '[]'::jsonb,
  key_insights text[] not null default array[]::text[],
  action_items text[] not null default array[]::text[],
  tags text[] not null default array[]::text[]
);
create index if not exists ideas_user_created_idx on ideas(user_id, created_at desc);
alter table ideas enable row level security;

-- Reset ideas policies to include sharing
drop policy if exists "ideas owner all" on ideas;
create policy "ideas owner all" on ideas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Idea shares table
create table if not exists idea_shares (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(idea_id, shared_with_id)
);
alter table idea_shares enable row level security;

drop policy if exists "idea_shares owner all" on idea_shares;
create policy "idea_shares owner all" on idea_shares for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "idea_shares shared read" on idea_shares;
create policy "idea_shares shared read" on idea_shares for select
  using (auth.uid() = shared_with_id);

-- 4. Allow shared users to read and update ideas (never delete)
drop policy if exists "ideas shared read" on ideas;
create policy "ideas shared read" on ideas for select
  using (
    exists (
      select 1 from idea_shares
      where idea_id = ideas.id and shared_with_id = auth.uid()
    )
  );

drop policy if exists "ideas shared update" on ideas;
create policy "ideas shared update" on ideas for update
  using (
    exists (
      select 1 from idea_shares
      where idea_id = ideas.id and shared_with_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from idea_shares
      where idea_id = ideas.id and shared_with_id = auth.uid()
    )
  );
