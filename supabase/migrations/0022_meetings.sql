-- Meetings: record long multi-person conversations, transcribe, summarize,
-- and extract action items as tasks. Audio blob is deleted after processing
-- — only the transcript + summary + tasks persist.

create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  org_id          uuid references public.organizations(id) on delete cascade,
  project_id      uuid references public.projects(id)      on delete set null,
  title           text not null default 'Meeting',
  transcript      text,
  summary         text,
  decisions       jsonb not null default '[]'::jsonb,
  action_items    jsonb not null default '[]'::jsonb,
  duration_seconds integer,
  language        text,
  status          text not null default 'processing'
                  check (status in ('processing', 'done', 'failed')),
  error           text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists meetings_user_idx    on public.meetings(user_id, created_at desc);
create index if not exists meetings_org_idx     on public.meetings(org_id, created_at desc) where org_id is not null;
create index if not exists meetings_project_idx on public.meetings(project_id, created_at desc) where project_id is not null;

-- Link tasks back to their source meeting (so the meeting card can show
-- "12 tasks created from this meeting" and inverse navigation works).
alter table public.tasks
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null;

create index if not exists tasks_meeting_idx on public.tasks(meeting_id) where meeting_id is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.meetings enable row level security;

-- Read: creator or any active member of the meeting's org
create policy "meetings_select" on public.meetings for select
  using (
    user_id = auth.uid()
    or (
      org_id is not null and exists (
        select 1 from public.organization_members
        where org_id  = meetings.org_id
          and user_id = auth.uid()
          and status  = 'active'
      )
    )
  );

-- Insert: must be the creator; if scoped to an org, must be an active member
create policy "meetings_insert" on public.meetings for insert
  with check (
    user_id = auth.uid()
    and (
      org_id is null
      or exists (
        select 1 from public.organization_members
        where org_id  = meetings.org_id
          and user_id = auth.uid()
          and status  = 'active'
      )
    )
  );

-- Update: creator only (transcript/summary backfill happens via server-side
-- service role anyway; this gates user-driven edits like title)
create policy "meetings_update" on public.meetings for update
  using (user_id = auth.uid());

-- Delete: creator only
create policy "meetings_delete" on public.meetings for delete
  using (user_id = auth.uid());

-- ── Feature flag registry ────────────────────────────────────────────────────
insert into public.feature_flags (key, description, rollout) values
  ('meetings', 'Record long multi-person meetings, transcribe, and auto-extract action items as tasks', 'admin')
on conflict (key) do nothing;

update public.feature_flags
   set category   = 'Team',
       how_to_use  = 'A "Meeting" card appears in the dashboard sidebar (below the install primer). Tap "Start meeting" before a meeting begins — the screen can be off but the app must stay foregrounded on mobile. Tap "End meeting" when finished. The audio uploads, Whisper transcribes the whole thing, the AI extracts a summary, decisions, and action items, and assigns each action to the right team member by name. The audio file is deleted as soon as processing completes — only the transcript and tasks remain.',
       impact      = 'Turns a 45-minute meeting into a transcript, summary, and a punch list of assigned tasks. No one has to take notes. Action items auto-route to team members and land in the same task feed everyone already uses. Free for beta — uses the same Groq Whisper pipeline that powers voice capture, so cost is effectively zero.',
       location    = 'Dashboard sidebar — MeetingCard, below InstallPrimer'
 where key = 'meetings';
