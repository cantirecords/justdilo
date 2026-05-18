-- Beta tester flag on profiles
alter table public.profiles
  add column if not exists is_beta_tester boolean not null default false;

-- Feature flags registry
create table if not exists public.feature_flags (
  key         text primary key,
  description text,
  rollout     text not null default 'admin'
              check (rollout in ('off', 'admin', 'beta', 'all')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.feature_flags enable row level security;

-- Who is the admin? (single source of truth)
create or replace function public.is_app_admin(p_user_id uuid)
returns boolean language sql security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users
    where id = p_user_id and email = 'yorohn@duck.com'
  );
$$;

-- Read flags: everyone can read (needed so the client can know what's enabled)
create policy "flags_read_all" on public.feature_flags for select
  using (true);

-- Write flags: admin only
create policy "flags_admin_write" on public.feature_flags for all
  using (public.is_app_admin(auth.uid()))
  with check (public.is_app_admin(auth.uid()));

-- Resolve enabled flags for a user (RPC)
create or replace function public.get_enabled_features(p_user_id uuid)
returns table(key text, enabled boolean)
language sql security definer set search_path = public as $$
  select
    f.key,
    case
      when f.rollout = 'off'  then false
      when public.is_app_admin(p_user_id) then true
      when f.rollout = 'all'  then true
      when f.rollout = 'beta' then coalesce(
        (select p.is_beta_tester from public.profiles p where p.id = p_user_id),
        false
      )
      else false
    end as enabled
  from public.feature_flags f;
$$;

-- Seed initial flags (everything I just shipped starts admin-only)
insert into public.feature_flags (key, description, rollout) values
  ('smart_insights',                'Recurring + priority recalibration banner above task list', 'admin'),
  ('abandonment_hint',              'Show abandonment % warning in QuickAdd',                    'admin'),
  ('priority_effectiveness_panel',  'Priority completion rate section in Stats',                 'admin')
on conflict (key) do nothing;
