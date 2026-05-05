import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { appendToIdea, transcribeAudio } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Fetch existing idea
  const { data: existing, error: fetchError } = await supabase
    .from("ideas")
    .select("title,summary,sections,key_insights,action_items,tags")
    .eq("id", id)
    .single();

  if (fetchError || !existing) return NextResponse.json({ error: "idea not found" }, { status: 404 });

  // Get new content — audio or text
  let newText = "";
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return NextResponse.json({ error: "no audio" }, { status: 400 });
    try {
      ({ text: newText } = await transcribeAudio(audio));
    } catch (e: any) {
      return NextResponse.json({ error: "Couldn't transcribe audio", detail: e?.message }, { status: 422 });
    }
  } else {
    const body = await req.json();
    newText = body.text ?? "";
  }

  if (!newText.trim()) return NextResponse.json({ error: "no content" }, { status: 400 });

  // Merge with AI
  let merged;
  try {
    merged = await appendToIdea(existing, newText);
  } catch (e) {
    console.error("[append] appendToIdea failed:", e);
    return NextResponse.json({ error: "AI failed to process. Please try again." }, { status: 502 });
  }

  // Attribution
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, email")
    .eq("id", user.id)
    .single();
  const nickname = profile?.nickname || profile?.email?.split("@")[0] || "Someone";

  const { data, error } = await supabase
    .from("ideas")
    .update({
      ...merged,
      last_edited_by_id: user.id,
      last_edited_at: new Date().toISOString(),
      last_edited_by_nickname: nickname,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[append] update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ idea: data });
}
