import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Own ideas
  const { data: ownIdeas, error } = await supabase
    .from("ideas")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Collaborators for own ideas
  const ownIds = (ownIdeas ?? []).map((i) => i.id);
  const sharesMap: Record<string, { id: string; email: string }[]> = {};
  if (ownIds.length > 0) {
    const { data: shares } = await supabase
      .from("idea_shares").select("idea_id, shared_with_id").in("idea_id", ownIds);
    const sharedWithIds = [...new Set((shares ?? []).map((s) => s.shared_with_id))];
    if (sharedWithIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, email").in("id", sharedWithIds);
      const emailMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.email]));
      for (const s of shares ?? []) {
        if (!sharesMap[s.idea_id]) sharesMap[s.idea_id] = [];
        sharesMap[s.idea_id].push({ id: s.shared_with_id, email: emailMap[s.shared_with_id] ?? "" });
      }
    }
  }

  // Ideas shared with me
  const { data: sharedLinks } = await supabase
    .from("idea_shares").select("idea_id").eq("shared_with_id", user.id);
  const sharedIds = (sharedLinks ?? []).map((s) => s.idea_id);
  let sharedIdeas: any[] = [];
  if (sharedIds.length > 0) {
    const { data } = await supabase
      .from("ideas").select("*").in("id", sharedIds).order("created_at", { ascending: false });
    sharedIdeas = data ?? [];
  }

  const ideas = [
    ...(ownIdeas ?? []).map((i) => ({ ...i, is_owner: true, collaborators: sharesMap[i.id] ?? [] })),
    ...sharedIdeas.map((i) => ({ ...i, is_owner: false, collaborators: [] })),
  ];

  return NextResponse.json({ ideas });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });

  const { error } = await supabase.from("ideas").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
