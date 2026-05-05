import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { transcribeAudio, answerQuestion } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const audio = form.get("audio");
  const tasksContext = form.get("tasks_context");

  if (!(audio instanceof File)) return NextResponse.json({ error: "no audio" }, { status: 400 });

  let question = "";
  try {
    ({ text: question } = await transcribeAudio(audio));
  } catch (e: any) {
    return NextResponse.json({ error: "Couldn't hear clearly. Try again." }, { status: 422 });
  }

  if (!question.trim()) return NextResponse.json({ error: "Couldn't hear anything." }, { status: 422 });

  const answer = await answerQuestion(question, String(tasksContext ?? ""));
  return NextResponse.json({ question, answer });
}
