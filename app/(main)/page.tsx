import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { Organization, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, orgs_enabled")
    .eq("id", user.id)
    .single();

  const orgsEnabled = profile?.orgs_enabled === true;

  // Only load org data for accounts with the feature enabled
  let initialOrgs: Organization[] = [];
  let initialOrgTasks: Task[] = [];

  if (orgsEnabled) {
    const [{ data: orgsData }, { data: orgTasksData, error: orgTasksErr }] = await Promise.all([
      supabase
        .from("organizations")
        .select("*, members:organization_members(*, profile:profiles!user_id(nickname, email))")
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("*, assigned_to:profiles!assigned_to_id(nickname, email)")
        .not("org_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (orgTasksErr) console.error("[page] org tasks query failed:", orgTasksErr);
    initialOrgs = (orgsData ?? []) as unknown as Organization[];
    const rawOrgTasks = (orgTasksData ?? []) as unknown as Task[];

    // Hydrate multi-assignees from task_assignees table
    if (rawOrgTasks.length > 0) {
      const taskIds = rawOrgTasks.map((t) => t.id);
      const { data: assigneeRows } = await supabase
        .from("task_assignees")
        .select("task_id, user_id, profile:profiles!user_id(nickname, email)")
        .in("task_id", taskIds);
      const byTaskId = new Map<string, any[]>();
      for (const row of assigneeRows ?? []) {
        if (!byTaskId.has(row.task_id)) byTaskId.set(row.task_id, []);
        byTaskId.get(row.task_id)!.push({ user_id: row.user_id, profile: row.profile });
      }
      initialOrgTasks = rawOrgTasks.map((t) => ({
        ...t,
        assignees: byTaskId.get(t.id) ?? null,
      }));
    } else {
      initialOrgTasks = rawOrgTasks;
    }
  }

  // Personal tasks: only filter out org_id when the user actually has orgs.
  // Otherwise, fetch all tasks for the user (every task is personal anyway).
  const personalQuery = initialOrgs.length > 0
    ? supabase.from("tasks").select("*").eq("user_id", user.id).is("org_id", null).order("created_at", { ascending: false }).limit(200)
    : supabase.from("tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
  const { data: tasksData, error: tasksErr } = await personalQuery;
  if (tasksErr) console.error("[page] personal tasks query failed:", tasksErr);
  const tasks = tasksData;

  return (
    <Dashboard
      initialTasks={(tasks ?? []) as Task[]}
      userEmail={user.email ?? ""}
      userId={user.id}
      initialNickname={profile?.nickname ?? null}
      orgsEnabled={orgsEnabled}
      initialOrgs={initialOrgs}
      initialOrgTasks={initialOrgTasks}
    />
  );
}
