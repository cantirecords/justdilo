import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import WidgetApp from "@/components/WidgetApp";

export const dynamic = "force-dynamic";

export default async function FullWidgetPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, priority, completed, group_name")
    .eq("user_id", user.id)
    .eq("completed", false)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(30);

  return <WidgetApp initialTasks={tasks ?? []} />;
}
