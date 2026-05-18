import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ members: [], org_id: null });

  const { data: profile } = await supabase
    .from("profiles")
    .select("orgs_enabled")
    .eq("id", user.id)
    .single();
  if (!profile?.orgs_enabled) return NextResponse.json({ members: [], org_id: null });

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  const orgId = memberships?.[0]?.org_id ?? null;
  if (!orgId) return NextResponse.json({ members: [], org_id: null });

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, invited_email, profile:profiles!user_id(nickname, email)")
    .eq("org_id", orgId)
    .eq("status", "active")
    .not("user_id", "is", null);

  const result = (members ?? []).map((m: any) => {
    const p = m.profile as { nickname: string | null; email: string } | null;
    const nickname = p?.nickname ?? null;
    const email = p?.email ?? m.invited_email ?? "";
    const display = nickname || email.split("@")[0];
    return { user_id: m.user_id as string, display, nickname, email };
  });

  return NextResponse.json({ members: result, org_id: orgId });
}
