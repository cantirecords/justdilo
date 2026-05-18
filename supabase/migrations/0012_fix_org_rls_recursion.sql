-- Fix "infinite recursion detected in policy" on organization_members and tasks.
-- Root cause: policies on organization_members and tasks query organization_members
-- inside their USING clauses, which re-triggers RLS on organization_members → recursion.
-- Fix: wrap the membership check in a SECURITY DEFINER function that bypasses RLS.

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id  = p_org_id
      and user_id = auth.uid()
      and status  = 'active'
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where org_id  = p_org_id
      and user_id = auth.uid()
      and role    in ('owner', 'admin')
      and status  = 'active'
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid)  to authenticated;

-- ── Rebuild organizations select policy ───────────────────────────────────────
drop policy if exists "orgs member select" on public.organizations;
create policy "orgs member select" on public.organizations for select
  using (public.is_org_member(id));

-- ── Rebuild organization_members select policy ───────────────────────────────
drop policy if exists "org_members active select" on public.organization_members;
create policy "org_members active select" on public.organization_members for select
  using (user_id = auth.uid() or public.is_org_member(org_id));

-- ── Rebuild tasks org policies ────────────────────────────────────────────────
drop policy if exists "tasks org select" on public.tasks;
create policy "tasks org select" on public.tasks for select
  using (org_id is not null and public.is_org_member(org_id));

drop policy if exists "tasks org insert" on public.tasks;
create policy "tasks org insert" on public.tasks for insert
  with check (org_id is not null and public.is_org_member(org_id));

drop policy if exists "tasks org update" on public.tasks;
create policy "tasks org update" on public.tasks for update
  using (org_id is not null and public.is_org_member(org_id));

drop policy if exists "tasks org delete" on public.tasks;
create policy "tasks org delete" on public.tasks for delete
  using (
    org_id is not null and (
      user_id = auth.uid() or public.is_org_admin(org_id)
    )
  );
