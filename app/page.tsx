import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return <Dashboard initialTasks={tasks ?? []} userEmail={user.email ?? ""} />;
}
