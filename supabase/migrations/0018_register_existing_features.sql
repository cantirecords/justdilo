-- Register every admin-only feature already in the codebase
-- so it appears in the admin Flags tab and can be promoted to beta or all.

insert into public.feature_flags (key, description, rollout) values
  ('organizations_teams',  'Teams/Organizations workspace (sidebar Users icon)', 'admin'),
  ('projects',             'Project management workspace (sidebar Folder icon)', 'admin'),
  ('dev_debug_overlay',    'AI response JSON overlay shown after each task creation', 'admin'),
  ('task_detail_drawer',   'Slide-out drawer with task comments and history',         'admin')
on conflict (key) do nothing;

update public.feature_flags
   set category   = 'Collaboration',
       description = 'Teams/Organizations workspace — invite people, share tasks, multi-assignee tasks',
       how_to_use  = 'Click the Users icon in the sidebar header to open the Teams panel. Create an organization, invite members by email, assign tasks across the team. Team tasks live in the same list as personal ones, just with assignee chips.',
       impact      = 'Turns JustDilo from a solo tool into a small-team coordination layer. Biggest single feature in the codebase — gate carefully before opening to all users.',
       location    = 'Dashboard sidebar header (Users icon) + OrgPanel modal'
 where key = 'organizations_teams';

update public.feature_flags
   set category   = 'Collaboration',
       description = 'Project workspace — group tasks under named projects with members and progress',
       how_to_use  = 'Click the Folder icon in the sidebar header to open the Projects panel. Create a project, attach it to an org, assign members. Projects are an organizing layer on top of tasks. Requires organizations_teams to be useful.',
       impact      = 'Adds Notion/Asana-style structure to team workflows. Pair with organizations_teams when promoting.',
       location    = 'Dashboard sidebar header (Folder icon) + ProjectPanel modal'
 where key = 'projects';

update public.feature_flags
   set category   = 'Developer',
       description = 'Raw AI response overlay shown after every QuickAdd or voice capture',
       how_to_use  = 'After you add a task via voice or QuickAdd, an overlay shows the full JSON the AI returned (intent, tasks, group summary, etc.). Useful for debugging prompt quality and unexpected categorizations.',
       impact      = 'Internal tool for tuning the AI. Should never go to non-technical users — keep at admin or beta-for-testers only.',
       location    = 'Dashboard root (TranscriptDebug component, appears as overlay)'
 where key = 'dev_debug_overlay';

update public.feature_flags
   set category   = 'UX',
       description = 'Slide-out drawer for task detail with comments and history (replacement for inline edit modal)',
       how_to_use  = 'Click a task to open a drawer on the right with full detail, comment thread, and edit controls. Replaces the small TaskEditModal for richer interactions.',
       impact      = 'Better surface for collaboration features (comments, mentions) and longer context. Test in admin first to validate the interaction pattern.',
       location    = 'TaskDetailDrawer (right slide-out on task click)'
 where key = 'task_detail_drawer';
