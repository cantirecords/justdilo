import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { detectSpanish } from "@/lib/push-messages";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: idea } = await supabase
    .from("ideas").select("id").eq("id", id).eq("user_id", user.id).single();
  if (!idea) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: shares } = await supabase
    .from("idea_shares")
    .select("shared_with_id")
    .eq("idea_id", id);

  const sharedIds = (shares ?? []).map((s) => s.shared_with_id);
  let collaborators: { id: string; email: string }[] = [];
  if (sharedIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles").select("id, email").in("id", sharedIds);
    collaborators = (profiles ?? []).map((p) => ({ id: p.id, email: p.email }));
  }

  return NextResponse.json({ collaborators });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: idea } = await supabase
    .from("ideas").select("id").eq("id", id).eq("user_id", user.id).single();
  if (!idea) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { email } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("id, email").eq("email", email.trim().toLowerCase()).single();

  if (!profile) {
    return NextResponse.json(
      { error: "No Dilo account found for this email" },
      { status: 404 },
    );
  }
  if (profile.id === user.id) {
    return NextResponse.json({ error: "You can't share with yourself" }, { status: 400 });
  }

  const { data: ideaData } = await supabase
    .from("ideas").select("title").eq("id", id).single();

  const { error } = await supabase.from("idea_shares").insert({
    idea_id: id,
    owner_id: user.id,
    shared_with_id: profile.id,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already shared with this person" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Instant push to the recipient
  const ideaTitle = ideaData?.title ?? "an idea";
  const sharerName = user.email?.split("@")[0] ?? "Someone";
  const spanish = detectSpanish([ideaTitle]);
  sendPushToUser(profile.id, {
    title: spanish ? "Nueva idea compartida 💡" : "New shared idea 💡",
    body: spanish
      ? `${sharerName} compartió contigo: "${ideaTitle}"`
      : `${sharerName} shared with you: "${ideaTitle}"`,
    url: "/",
  }).catch(() => {}); // fire-and-forget, don't block the response

  return NextResponse.json({ collaborator: { id: profile.id, email: profile.email } });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: idea } = await supabase
    .from("ideas").select("id").eq("id", id).eq("user_id", user.id).single();
  if (!idea) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const { error } = await supabase
    .from("idea_shares")
    .delete()
    .eq("idea_id", id)
    .eq("shared_with_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
