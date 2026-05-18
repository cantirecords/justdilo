-- Org creation as a SECURITY DEFINER RPC.
-- Avoids RLS edge cases on the INSERT (the WITH CHECK was failing for some clients)
-- and guarantees the creator becomes an active owner-member atomically.

create or replace function public.create_organization(p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid;
  v_user_email text;
  v_org        public.organizations;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_user_id and orgs_enabled = true
  ) then
    raise exception 'orgs feature not enabled for this account' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name required' using errcode = '22023';
  end if;

  select coalesce(p.email, u.email) into v_user_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_user_id;

  insert into public.organizations (name, created_by)
  values (btrim(p_name), v_user_id)
  returning * into v_org;

  insert into public.organization_members (org_id, user_id, invited_email, role, status)
  values (v_org.id, v_user_id, v_user_email, 'owner', 'active');

  return v_org;
end;
$$;

grant execute on function public.create_organization(text) to authenticated;
