-- Grant orgs_enabled to all users who are active org members.
-- Previously only the admin account had this set; now any user added to an org
-- needs it so their dashboard loads org tasks and org UI.
update public.profiles p
set orgs_enabled = true
where exists (
  select 1 from public.organization_members om
  where om.user_id = p.id
    and om.status = 'active'
)
and (p.orgs_enabled is null or p.orgs_enabled = false);
