import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { structureIdea, transcribeAudio } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let text = "";
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return NextResponse.json({ error: "no audio" }, { status: 400 });
    try {
      ({ text } = await transcribeAudio(audio));
    } catch (e: any) {
      return NextResponse.json({ error: "Couldn't transcribe audio", detail: e?.message }, { status: 422 });
    }
  } else {
    const body = await req.json();
    text = body.text ?? "";
  }

  if (!text.trim()) return NextResponse.json({ error: "no text" }, { status: 400 });

  let structured;
  try {
    structured = await structureIdea(text);
  } catch (e) {
    console.error("[process-idea] structureIdea failed:", e);
    return NextResponse.json({ error: "AI failed to process idea. Please try again." }, { status: 502 });
  }

  const { data, error } = await supabase.from("ideas").insert({
    user_id: user.id,
    raw_input: text,
    title: structured.title,
    summary: structured.summary,
    sections: structured.sections,
    key_insights: structured.key_insights,
    action_items: structured.action_items,
    tags: structured.tags,
  }).select().single();

  if (error) {
    console.error("[process-idea] insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[process-idea] saved idea:", data.id, "tags:", structured.tags);
  return NextResponse.json({ idea: data });
}
