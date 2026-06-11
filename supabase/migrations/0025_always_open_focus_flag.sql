-- Force the app to open in Focus view on every fresh mount (ignores last-used view).
-- Admin-only until promoted from the Flags tab.

insert into public.feature_flags (key, description, rollout) values
  ('always_open_focus', 'Always open the app in Focus view (ignores last-used view in localStorage)', 'admin')
on conflict (key) do nothing;

update public.feature_flags
   set category   = 'UX',
       how_to_use  = 'When on, every fresh mount of the task feed switches to the Focus subview regardless of what the user picked last. The user can still tap List/Ideas/Stats during the session — but reopening the app starts in Focus again.',
       impact      = 'Owner preference: keep the daily entry point on Focus so the most urgent items are always front-and-center. Off by default for others until validated.',
       location    = 'components/TaskFeed.tsx (TaskFeed component, useFeature("always_open_focus"))'
 where key = 'always_open_focus';
