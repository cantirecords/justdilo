-- New flags: onboarding hints + user activity panel
insert into public.feature_flags (key, description, rollout) values
  ('onboarding_hints',    'Three example phrase chips below the mic when the user has zero tasks', 'admin'),
  ('user_activity_panel', 'Active users / last-seen list in admin Analysis tab',                    'admin')
on conflict (key) do nothing;

update public.feature_flags
   set category   = 'Activation',
       how_to_use  = 'Brand-new users (taskCount = 0) see three tappable example phrases under the mic — locale-aware (English/Spanish). Tapping one opens QuickAdd pre-filled so they can hit send. Chips disappear automatically once they have any task.',
       impact      = 'Removes the cold-start moment where users see a mic and don''t know what to say. Highest leverage for activation since voice-first is unusual UX.',
       location    = 'Dashboard sidebar (OnboardingHints component, below mic copy)'
 where key = 'onboarding_hints';

update public.feature_flags
   set category   = 'Analytics',
       how_to_use  = 'Open the admin panel → Analysis tab. Shows total users, active in last 24h/7d/30d, daily active count for last 30 days, and a per-user list sorted by last activity. Useful at any scale (proper cohort math comes later).',
       impact      = 'Tells you who is actually using JustDilo without leaving the app. Surfaces churn signals (no activity in N days) and engagement (sticky users).',
       location    = 'AdminPanel → Analysis tab (UserActivitySection)'
 where key = 'user_activity_panel';
