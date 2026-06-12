import { createSupabaseServer } from "@/lib/supabase/server";
import WidgetApp from "@/components/WidgetApp";

export const dynamic = "force-dynamic";

// See app/widget/page.tsx — signed-out users get the in-widget sign-in card,
// never a redirect to the full login page.
export default async function FullWidgetPage() {
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
      .limit(100));
  }

  return <WidgetApp initialTasks={tasks ?? []} variant="full" />;
}
