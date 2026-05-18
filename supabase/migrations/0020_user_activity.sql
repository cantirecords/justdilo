-- Admin-only user activity summary
-- Returns aggregate counts + per-user last-seen + daily active series (last 30 days)
create or replace function public.get_user_activity_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_result  jsonb;
begin
  if not public.is_app_admin(v_user_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with last_activity as (
    select t.user_id, max(t.created_at) as last_at
    from public.tasks t
    group by t.user_id
  ),
  daily_counts as (
    select date_trunc('day', t.created_at)::date as day,
           count(distinct t.user_id) as active_users
    from public.tasks t
    where t.created_at >= (now() - interval '30 days')
    group by 1
    order by 1
  ),
  user_details as (
    select u.id,
           u.email,
           p.nickname,
           la.last_at,
           (select count(*) from public.tasks t
              where t.user_id = u.id
                and t.created_at >= (now() - interval '30 days')) as tasks_30d
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join last_activity la on la.user_id = u.id
  )
  select jsonb_build_object(
    'totalUsers',  (select count(*)::int from auth.users),
    'active24h',   (select count(*)::int from last_activity where last_at >= now() - interval '24 hours'),
    'active7d',    (select count(*)::int from last_activity where last_at >= now() - interval '7 days'),
    'active30d',   (select count(*)::int from last_activity where last_at >= now() - interval '30 days'),
    'dailyActives',(select coalesce(jsonb_agg(jsonb_build_object('date', day, 'count', active_users) order by day), '[]'::jsonb)
                    from daily_counts),
    'users',       (select coalesce(jsonb_agg(
                      jsonb_build_object(
                        'id', id,
                        'email', email,
                        'nickname', nickname,
                        'lastActivityAt', last_at,
                        'tasks30d', tasks_30d
                      ) order by last_at desc nulls last
                    ), '[]'::jsonb)
                    from user_details)
  )
  into v_result;

  return v_result;
end;
$$;
