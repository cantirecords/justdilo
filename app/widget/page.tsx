import { createSupabaseServer } from "@/lib/supabase/server";
import WidgetApp from "@/components/WidgetApp";

export const dynamic = "force-dynamic";

// No redirect to /login when signed out — this renders inside a small
// frameless always-on-top window where the login page is unusable. WidgetApp
// shows a sign-in card that opens the main app window instead.
export default async function WidgetPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  let tasks = null;
  if (user) {
    ({ data: tasks } = await supabase
      .from("tasks")
      .select("id, title, due_date, priority, group_name")
      .eq("user_id", user.id)
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50));
  }

  return <WidgetApp initialTasks={tasks ?? []} variant="standard" />;
}
