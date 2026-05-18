-- Richer metadata for the feature flag registry
alter table public.feature_flags
  add column if not exists category    text,
  add column if not exists how_to_use  text,
  add column if not exists impact      text,
  add column if not exists location    text,
  add column if not exists created_at  timestamptz not null default now();

-- Backfill metadata for the 3 seeded flags (idempotent updates)
update public.feature_flags
   set category   = 'AI Insights',
       description = 'Recurring task + priority recalibration banner shown above the task list',
       how_to_use  = 'Open the Tasks tab in list or focus view. If you''ve added the same kind of task multiple times (e.g. "buy oat milk" 4 times this month), an amber chip suggests making it recurring. A second chip appears when low-priority tasks close more often than high-priority ones.',
       impact      = 'Helps users notice patterns they''d otherwise miss and recalibrate priorities. Reduces re-entry friction for recurring chores.',
       location    = 'TaskFeed (above list when subView is list or focus)'
 where key = 'smart_insights';

update public.feature_flags
   set category   = 'Behavior nudge',
       description = 'One-line warning inside QuickAdd when the user''s undated tasks rarely finish',
       how_to_use  = 'Open QuickAdd (⌘K or +). If your historic abandonment rate for undated tasks is ≥50% across ≥5 samples, you''ll see an amber tip nudging you to add a deadline. Computed live from your own completion data.',
       impact      = 'Encourages adding due dates without being annoying — only shows for users whose data proves the pattern. Should lift completion rate over time.',
       location    = 'QuickAdd bottom sheet (below textarea)'
 where key = 'abandonment_hint';

update public.feature_flags
   set category   = 'Analytics',
       description = 'Per-priority completion rate breakdown in the Stats card',
       how_to_use  = 'Open the Stats/Overview card on the home screen. A new section "Priority effectiveness" shows completion % and average days-to-complete grouped by high/medium/low priority. Reveals whether your urgent labels actually correlate with what you finish.',
       impact      = 'Surfaces personal data about prioritization quality. Pairs with the priority recalibration chip in smart_insights.',
       location    = 'StatsCard (below main metrics)'
 where key = 'priority_effectiveness_panel';
