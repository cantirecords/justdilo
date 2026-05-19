import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { summarizeMeeting } from "@/lib/meetings";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/meetings/[id]/regenerate — re-run summarization on an existing
// transcript. Useful when the original output was thin or the template
// changed since. Does NOT touch tasks (those are already created and may
// have been edited).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: meeting, error: getErr } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (getErr || !meeting) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!meeting.transcript?.trim()) {
    return NextResponse.json({ error: "no transcript to re-summarize" }, { status: 400 });
  }

  // Load the template that was used
  let template: any = null;
  if (meeting.template_id) {
    const { data: t } = await supabase
      .from("meeting_templates")
      .select("name, description, sections")
      .eq("id", meeting.template_id)
      .maybeSingle();
    if (t) template = t;
  }
  if (!template) {
    const { data: g } = await supabase
      .from("meeting_templates")
      .select("name, description, sections")
      .eq("is_builtin", true)
      .eq("slug", "general")
      .maybeSingle();
    template = g ?? {
      name: "General",
      description: null,
      sections: [
        { key: "decisions", label: "Decisions", description: "Concrete decisions the group made" },
        { key: "action_items", label: "Action items", description: "Tasks assigned to specific people" },
      ],
    };
  }

  // Resolve roster so assignee_name still maps to real people
  type Member = { user_id: string; lookup: string };
  const rosterNames: string[] = [];
  if (meeting.org_id) {
    const { data: members } = await supabase
      .from("organization_members")
      .select("user_id, invited_email, profile:profiles!user_id(nickname, email)")
      .eq("org_id", meeting.org_id)
      .eq("status", "active")
      .not("user_id", "is", null);
    for (const m of members ?? []) {
      const p = (m as any).profile as { nickname: string | null; email: string } | null;
      const display = p?.nickname || p?.email?.split("@")[0] || (m as any).invited_email?.split("@")[0];
      if (display) rosterNames.push(display);
    }
  }

  let summary: Awaited<ReturnType<typeof summarizeMeeting>>;
  try {
    summary = await summarizeMeeting(meeting.transcript, rosterNames, {
      name: template.name,
      description: template.description,
      sections: template.sections ?? [],
    });
  } catch (e: any) {
    console.error("[meetings/regenerate] summarize failed:", e?.message);
    return NextResponse.json({ error: "Couldn't re-summarize", detail: e?.message }, { status: 502 });
  }

  // Update only the summary-derived fields. Title stays unless it was empty.
  // Action items / tasks are NOT touched — user may have edited them already.
  const update: Record<string, unknown> = {
    summary: summary.summary,
    sections: summary.sections ?? {},
    decisions: summary.sections?.decisions ?? meeting.decisions ?? [],
    language: summary.language,
  };
  if (!meeting.title || meeting.title === "Meeting") {
    update.title = summary.title;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("meetings")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ meeting: updated });
}
