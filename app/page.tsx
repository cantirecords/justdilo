import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tasks }, { data: profile }] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("nickname").eq("id", user.id).single(),
  ]);

  return (
    <Dashboard
      initialTasks={tasks ?? []}
      userEmail={user.email ?? ""}
      initialNickname={profile?.nickname ?? null}
    />
  );
}
