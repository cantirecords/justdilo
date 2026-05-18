-- ─── Projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  description text,
  status      text not null default 'active'
              check (status in ('active', 'on_hold', 'done')),
  phase       text not null default 'planning'
              check (phase in ('planning', 'in_progress', 'review', 'done')),
  due_date    timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ─── Project members ─────────────────────────────────────────────────────────
create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('lead', 'member')),
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ─── Task assignees (many-to-many replaces single assigned_to_id) ────────────
create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (task_id, user_id)
);

-- ─── Task comments ───────────────────────────────────────────────────────────
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  body       text,
  link_url   text,
  file_path  text,
  file_name  text,
  created_at timestamptz not null default now()
);

-- ─── Link tasks to projects ───────────────────────────────────────────────────
alter table public.tasks
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_projects_org_id          on public.projects(org_id);
create index if not exists idx_project_members_user_id  on public.project_members(user_id);
create index if not exists idx_task_assignees_task_id   on public.task_assignees(task_id);
create index if not exists idx_task_assignees_user_id   on public.task_assignees(user_id);
create index if not exists idx_task_comments_task_id    on public.task_comments(task_id);
create index if not exists idx_tasks_project_id         on public.tasks(project_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.task_assignees  enable row level security;
alter table public.task_comments   enable row level security;

-- Projects: any org member can CRUD; only admins can delete
create policy "projects_select" on public.projects for select
  using (public.is_org_member(org_id));

create policy "projects_insert" on public.projects for insert
  with check (public.is_org_member(org_id) and created_by = auth.uid());

create policy "projects_update" on public.projects for update
  using (public.is_org_member(org_id));

create policy "projects_delete" on public.projects for delete
  using (public.is_org_admin(org_id));

-- Project members: readable/manageable by org members
create policy "project_members_select" on public.project_members for select
  using (exists (
    select 1 from public.projects p where p.id = project_id and public.is_org_member(p.org_id)
  ));

create policy "project_members_insert" on public.project_members for insert
  with check (exists (
    select 1 from public.projects p where p.id = project_id and public.is_org_member(p.org_id)
  ));

create policy "project_members_delete" on public.project_members for delete
  using (exists (
    select 1 from public.projects p where p.id = project_id and public.is_org_member(p.org_id)
  ));

-- Task assignees: task owner or org member
create policy "task_assignees_select" on public.task_assignees for select
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (t.user_id = auth.uid() or (t.org_id is not null and public.is_org_member(t.org_id)))
  ));

create policy "task_assignees_insert" on public.task_assignees for insert
  with check (exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (t.user_id = auth.uid() or (t.org_id is not null and public.is_org_member(t.org_id)))
  ));

create policy "task_assignees_delete" on public.task_assignees for delete
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (t.user_id = auth.uid() or (t.org_id is not null and public.is_org_member(t.org_id)))
  ));

-- Task comments: task owner or org member; only author can delete
create policy "task_comments_select" on public.task_comments for select
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (t.user_id = auth.uid() or (t.org_id is not null and public.is_org_member(t.org_id)))
  ));

create policy "task_comments_insert" on public.task_comments for insert
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (t.user_id = auth.uid() or (t.org_id is not null and public.is_org_member(t.org_id)))
    )
  );

create policy "task_comments_delete" on public.task_comments for delete
  using (user_id = auth.uid());
