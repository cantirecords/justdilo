import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "no audio" }, { status: 400 });
  }

  try {
    const transcript = await transcribeAudio(audio);
    return NextResponse.json({ transcript });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Couldn't hear clearly. Try again.", detail: e?.message },
      { status: 422 },
    );
  }
}
