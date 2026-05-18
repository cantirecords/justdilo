import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// List meetings visible to the user (own + any org they belong to). RLS handles scoping.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const orgId = url.searchParams.get("org_id");
  const projectId = url.searchParams.get("project_id");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);

  let q = supabase
    .from("meetings")
    .select("id, user_id, org_id, project_id, title, summary, decisions, action_items, duration_seconds, language, status, error, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orgId) q = q.eq("org_id", orgId);
  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meetings: data ?? [] });
}
