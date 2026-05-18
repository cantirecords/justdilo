-- Enable Supabase Realtime broadcasts for the tasks table so changes
-- propagate live across devices (phone / desktop / browser) without reload.
alter publication supabase_realtime add table public.tasks;
-- replica identity full ensures DELETE payloads include the row id.
alter table public.tasks replica identity full;
