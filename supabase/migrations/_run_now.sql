-- ─────────────────────────────────────────────────────────────────────────────
-- Meeting templates — pick a meeting type before recording to drive what the AI
-- extracts. Built-in templates are global (user_id null); users can also create
-- their own custom templates.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.meeting_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,  -- null = built-in
  name        text not null,
  slug        text not null,
  description text,
  -- sections: jsonb array of { key, label, description }
  sections    jsonb not null default '[]'::jsonb,
  is_builtin  boolean not null default false,
  created_at  timestamptz not null default now()
);

create unique index if not exists meeting_templates_builtin_slug
  on public.meeting_templates(slug) where is_builtin = true;
create unique index if not exists meeting_templates_user_slug
  on public.meeting_templates(user_id, slug) where user_id is not null;
create index if not exists meeting_templates_user_idx
  on public.meeting_templates(user_id, created_at desc) where user_id is not null;

alter table public.meeting_templates enable row level security;

drop policy if exists "meeting_templates read" on public.meeting_templates;
create policy "meeting_templates read" on public.meeting_templates
  for select using (is_builtin = true or user_id = auth.uid());

drop policy if exists "meeting_templates insert own" on public.meeting_templates;
create policy "meeting_templates insert own" on public.meeting_templates
  for insert with check (user_id = auth.uid() and is_builtin = false);

drop policy if exists "meeting_templates update own" on public.meeting_templates;
create policy "meeting_templates update own" on public.meeting_templates
  for update using (user_id = auth.uid() and is_builtin = false);

drop policy if exists "meeting_templates delete own" on public.meeting_templates;
create policy "meeting_templates delete own" on public.meeting_templates
  for delete using (user_id = auth.uid() and is_builtin = false);

-- Add template_id + sections columns to meetings
alter table public.meetings
  add column if not exists template_id uuid references public.meeting_templates(id) on delete set null,
  add column if not exists sections jsonb not null default '{}'::jsonb;

create index if not exists meetings_template_idx
  on public.meetings(template_id) where template_id is not null;

-- ─── Seed built-in templates ────────────────────────────────────────────────
insert into public.meeting_templates (user_id, name, slug, description, sections, is_builtin) values
  (null, 'General', 'general',
   'Default — fits any meeting',
   '[
     {"key":"decisions","label":"Decisions","description":"Concrete decisions the group made"},
     {"key":"action_items","label":"Action items","description":"Tasks assigned to specific people"}
   ]'::jsonb,
   true),
  (null, 'Marketing', 'marketing',
   'Campaign reviews, launches, content strategy',
   '[
     {"key":"campaigns","label":"Campaigns discussed","description":"Marketing campaigns reviewed or planned"},
     {"key":"ideas","label":"Ideas","description":"New marketing ideas raised"},
     {"key":"channels","label":"Channels","description":"Marketing channels and platforms mentioned"},
     {"key":"decisions","label":"Decisions","description":"Strategic decisions made"},
     {"key":"action_items","label":"Action items","description":"Tasks to execute"}
   ]'::jsonb,
   true),
  (null, 'Design Review', 'design_review',
   'Logo, UI, brand, or product design feedback',
   '[
     {"key":"feedback","label":"Feedback","description":"Design feedback raised by participants"},
     {"key":"iterations","label":"Iterations needed","description":"Specific changes requested"},
     {"key":"decisions","label":"Decisions","description":"Design decisions locked in"},
     {"key":"blockers","label":"Blockers","description":"Issues blocking design progress"},
     {"key":"action_items","label":"Action items","description":"Tasks to execute"}
   ]'::jsonb,
   true),
  (null, '1:1', 'one_on_one',
   'One-on-one check-ins',
   '[
     {"key":"topics","label":"Topics discussed","description":"Main topics covered"},
     {"key":"growth_points","label":"Growth points","description":"Career growth, feedback, or learning"},
     {"key":"blockers","label":"Blockers","description":"Things blocking the person"},
     {"key":"follow_ups","label":"Follow-ups","description":"Things to revisit next 1:1"},
     {"key":"action_items","label":"Action items","description":"Tasks to execute"}
   ]'::jsonb,
   true),
  (null, 'Daily Standup', 'standup',
   'Quick team sync — yesterday, today, blockers',
   '[
     {"key":"yesterday","label":"Yesterday","description":"What people completed since the last standup"},
     {"key":"today","label":"Today","description":"What people plan to do next"},
     {"key":"blockers","label":"Blockers","description":"Things blocking progress"},
     {"key":"action_items","label":"Action items","description":"Specific tasks to track"}
   ]'::jsonb,
   true)
on conflict do nothing;

-- ─── Register feature flags (admin-only first) ─────────────────────────────
insert into public.feature_flags (key, description, rollout, category, how_to_use, impact, location) values
  ('meeting_templates',
   'Pick a meeting type before recording — AI extracts type-specific sections',
   'admin',
   'TEAM',
   'When starting a new meeting, pick a template from the dropdown (General, Marketing, Design Review, 1:1, Standup, or your own custom). The AI will extract sections specific to that meeting type (e.g. for Marketing: campaigns, ideas, channels) instead of just generic decisions/action items. Tap "+ New template" in the picker to create your own with custom section names.',
   'Makes meeting summaries dramatically more useful — instead of generic output, you get sections relevant to the meeting type. Custom templates let teams capture exactly the info they care about (e.g. BTV streaming: on-air issues, content schedule, technical bugs).',
   '+ button → Meeting → Template picker shown above Start button'),

  ('regenerate_meeting_notes',
   'Re-run AI summarization on an existing meeting without re-recording',
   'admin',
   'TEAM',
   'Open any past meeting from the Meetings tab. A "✨ Regenerate notes" button appears next to Continue/Delete. Tap it to re-run the AI on the saved transcript — useful when the original output was too thin, or after you''ve improved the prompt/template. Tasks already created from the meeting are NOT touched (you may have edited them).',
   'Lets you fix bad past summaries without losing the meeting. The transcript persists after recording, so regeneration is fast (no re-upload, no re-transcription) — only the LLM step runs again. Especially valuable for long meetings where the first summary missed important details.',
   'Past meeting → drawer → ✨ Regenerate notes button')
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: grant orgs_enabled to all existing active org members.
-- Users added before this fix never had orgs_enabled set, so they couldn't
-- see org tasks or org UI. The API now sets this automatically on new invites.
-- ─────────────────────────────────────────────────────────────────────────────
update public.profiles p
set orgs_enabled = true
where exists (
  select 1 from public.organization_members om
  where om.user_id = p.id
    and om.status = 'active'
)
and (p.orgs_enabled is null or p.orgs_enabled = false);
