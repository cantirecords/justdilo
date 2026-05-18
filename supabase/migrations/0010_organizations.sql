-- Organization / team collaboration feature.
-- Feature-flagged: only users with profiles.orgs_enabled = true can use this.

-- ── Feature flag ──────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists orgs_enabled boolean not null default false;

-- ── Create both tables first (policies come after so cross-refs work) ─────────

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

create table public.organization_members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete cascade,
  invited_email text not null,
  role          text not null default 'member'
                  check (role in ('owner', 'admin', 'member')),
  status        text not null default 'pending'
                  check (status in ('pending', 'active')),
  created_at    timestamptz not null default now(),
  unique(org_id, invited_email)
);
create index org_members_org_idx   on public.organization_members(org_id);
create index org_members_user_idx  on public.organization_members(user_id) where user_id is not null;
create index org_members_email_idx on public.organization_members(invited_email);
alter table public.organization_members enable row level security;

-- ── RLS: organizations (safe to reference org_members now) ───────────────────
create policy "orgs member select" on public.organizations for select
  using (
    exists (
      select 1 from public.organization_members
      where org_id = organizations.id
        and user_id = auth.uid()
        and status  = 'active'
    )
  );

create policy "orgs creator insert" on public.organizations for insert
  with check (created_by = auth.uid());

create policy "orgs owner update" on public.organizations for update
  using (created_by = auth.uid());

create policy "orgs owner delete" on public.organizations for delete
  using (created_by = auth.uid());

-- ── RLS: organization_members ─────────────────────────────────────────────────
create policy "org_members active select" on public.organization_members for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.organization_members om2
      where om2.org_id  = organization_members.org_id
        and om2.user_id = auth.uid()
        and om2.status  = 'active'
    )
  );

create policy "org_members owner manage" on public.organization_members for all
  using (
    exists (
      select 1 from public.organizations
      where id         = organization_members.org_id
        and created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organizations
      where id         = organization_members.org_id
        and created_by = auth.uid()
    )
  );

-- ── Extend tasks table ────────────────────────────────────────────────────────
alter table public.tasks
  add column if not exists org_id         uuid references public.organizations(id) on delete cascade,
  add column if not exists assigned_to_id uuid references public.profiles(id)      on delete set null;

create index tasks_org_idx on public.tasks(org_id) where org_id is not null;

-- ── RLS: org tasks ────────────────────────────────────────────────────────────
create policy "tasks org select" on public.tasks for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organization_members
      where org_id  = tasks.org_id
        and user_id = auth.uid()
        and status  = 'active'
    )
  );

create policy "tasks org insert" on public.tasks for insert
  with check (
    org_id is not null and
    exists (
      select 1 from public.organization_members
      where org_id  = tasks.org_id
        and user_id = auth.uid()
        and status  = 'active'
    )
  );

create policy "tasks org update" on public.tasks for update
  using (
    org_id is not null and
    exists (
      select 1 from public.organization_members
      where org_id  = tasks.org_id
        and user_id = auth.uid()
        and status  = 'active'
    )
  );

create policy "tasks org delete" on public.tasks for delete
  using (
    org_id is not null and (
      user_id = auth.uid() or
      exists (
        select 1 from public.organization_members
        where org_id  = tasks.org_id
          and user_id = auth.uid()
          and role    in ('owner', 'admin')
          and status  = 'active'
      )
    )
  );

-- ── Auto-activate members who sign up ─────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  update organization_members
  set user_id = new.id,
      status  = 'active'
  where invited_email = new.email
    and status        = 'pending'
    and user_id       is null;

  return new;
end;
$$;
