import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { transcribeMeeting, summarizeMeeting } from "@/lib/meetings";
import { resolveDue } from "@/lib/ai";
import { detectCategory } from "@/lib/detectCategory";

export const runtime = "nodejs";
export const maxDuration = 300;

type FinishBody = {
  path: string;            // storage object path inside "captures" bucket
  duration_seconds?: number;
  org_id?: string | null;
  project_id?: string | null;
  utcOffset?: number;
  timezone?: string;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: FinishBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }
  const { path, duration_seconds, org_id, project_id } = body;
  const utcOffset = Number(body.utcOffset ?? 0);
  const timezone = body.timezone;
  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "missing path" }, { status: 400 });
  }
  // Path RLS check — the storage policy already enforces this, but fail fast.
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "path not owned by user" }, { status: 403 });
  }

  // ── Create the meeting row up-front in "processing" state ─────────────────
  const { data: meeting, error: meetingErr } = await supabase
    .from("meetings")
    .insert({
      user_id: user.id,
      org_id: org_id ?? null,
      project_id: project_id ?? null,
      duration_seconds: duration_seconds ?? null,
      status: "processing",
    })
    .select()
    .single();
  if (meetingErr || !meeting) {
    console.error("[meetings/finish] insert error:", meetingErr?.message);
    return NextResponse.json({ error: "Couldn't start meeting record" }, { status: 500 });
  }

  // Best-effort blob cleanup — runs in both success and failure paths.
  const deleteBlob = async () => {
    const { error } = await supabase.storage.from("captures").remove([path]);
    if (error) console.warn("[meetings/finish] blob cleanup failed:", error.message);
  };

  // ── Download audio from storage ───────────────────────────────────────────
  const { data: blob, error: dlErr } = await supabase.storage.from("captures").download(path);
  if (dlErr || !blob) {
    await supabase.from("meetings").update({ status: "failed", error: "Couldn't read recording" }).eq("id", meeting.id);
    await deleteBlob();
    return NextResponse.json({ error: "Couldn't read recording", detail: dlErr?.message }, { status: 500 });
  }

  // Convert to File for the transcription SDK
  const filename = path.split("/").pop() || "meeting.webm";
  const audioFile = new File([blob], filename, { type: blob.type || "audio/webm" });

  // ── Transcribe ────────────────────────────────────────────────────────────
  let transcript = "";
  try {
    const tx = await transcribeMeeting(audioFile);
    transcript = tx.text;
  } catch (e: any) {
    console.error("[meetings/finish] transcribe failed:", e?.message);
    await supabase.from("meetings").update({ status: "failed", error: `Transcription failed: ${e?.message ?? "unknown"}` }).eq("id", meeting.id);
    await deleteBlob();
    return NextResponse.json({ error: "Couldn't transcribe the meeting. Try again.", meeting_id: meeting.id }, { status: 502 });
  }

  if (!transcript.trim()) {
    await supabase.from("meetings").update({ status: "failed", error: "Empty transcript" }).eq("id", meeting.id);
    await deleteBlob();
    return NextResponse.json({ error: "No speech detected in the recording.", meeting_id: meeting.id }, { status: 422 });
  }

  // ── Resolve team roster (so action items can be assigned by name) ─────────
  type RosterMember = { user_id: string; nickname: string | null; email: string; lookup: string };
  const rosterByName = new Map<string, RosterMember>();
  if (org_id) {
    const { data: members } = await supabase
      .from("organization_members")
      .select("user_id, invited_email, profile:profiles!user_id(nickname, email)")
      .eq("org_id", org_id)
      .eq("status", "active")
      .not("user_id", "is", null);
    for (const m of members ?? []) {
      const p = (m as any).profile as { nickname: string | null; email: string } | null;
      const nickname = p?.nickname ?? null;
      const email = p?.email ?? (m as any).invited_email ?? "";
      const display = nickname || email.split("@")[0];
      rosterByName.set(display.toLowerCase(), {
        user_id: (m as any).user_id,
        nickname,
        email,
        lookup: display,
      });
    }
  }
  const teamMembers = [...rosterByName.values()].map((m) => m.lookup);

  // ── Summarize + extract action items ──────────────────────────────────────
  let summary: Awaited<ReturnType<typeof summarizeMeeting>>;
  try {
    summary = await summarizeMeeting(transcript, teamMembers);
  } catch (e: any) {
    console.error("[meetings/finish] summarize failed:", e?.message);
    // Save the transcript at least — the audio is still going away.
    await supabase.from("meetings").update({
      status: "failed",
      transcript,
      error: `Summary failed: ${e?.message ?? "unknown"}`,
    }).eq("id", meeting.id);
    await deleteBlob();
    return NextResponse.json({ error: "Couldn't summarize the meeting.", meeting_id: meeting.id, transcript }, { status: 502 });
  }

  // ── Create tasks from action items ────────────────────────────────────────
  type TaskRow = {
    user_id: string;
    title: string;
    summary: string | null;
    group_name: string;
    due_date: string | null;
    priority: "low" | "med" | "high" | null;
    category: string | null;
    completed: boolean;
    org_id: string | null;
    project_id: string | null;
    assigned_to_id: string | null;
    meeting_id: string;
    _memberUids: string[];
  };

  const groupName = summary.title || "Meeting";
  const rowsWithMeta: TaskRow[] = summary.action_items.map((item) => {
    const assigneeKey = item.assignee_name?.toLowerCase();
    const member = assigneeKey ? rosterByName.get(assigneeKey) : undefined;
    const memberUids = member ? [member.user_id] : [];
    return {
      user_id: user.id,
      title: item.title,
      summary: item.note ?? null,
      group_name: groupName,
      due_date: resolveDue(item.due ?? null, utcOffset, timezone)?.toISOString() ?? null,
      priority: item.priority ?? null,
      category: detectCategory(item.title) ?? null,
      completed: false,
      org_id: member ? org_id ?? null : null,
      project_id: member ? project_id ?? null : null,
      assigned_to_id: member?.user_id ?? null,
      meeting_id: meeting.id,
      _memberUids: memberUids,
    };
  });

  const rows = rowsWithMeta.map(({ _memberUids: _, ...r }) => r);

  let createdTasks: any[] = [];
  if (rows.length) {
    const { data, error: insertErr } = await supabase.from("tasks").insert(rows).select();
    if (insertErr) {
      console.error("[meetings/finish] task insert error:", insertErr.message);
      // Don't fail the whole meeting just because tasks didn't save — log + continue.
    } else {
      createdTasks = data ?? [];
      const assigneeRows: { task_id: string; user_id: string }[] = [];
      createdTasks.forEach((row: any, i: number) => {
        for (const uid of rowsWithMeta[i]?._memberUids ?? []) {
          assigneeRows.push({ task_id: row.id, user_id: uid });
        }
      });
      if (assigneeRows.length) {
        const { error: aErr } = await supabase.from("task_assignees").insert(assigneeRows);
        if (aErr) console.warn("[meetings/finish] task_assignees insert error:", aErr.message);
      }
    }
  }

  // ── Finalize the meeting row ──────────────────────────────────────────────
  const { data: finalized } = await supabase
    .from("meetings")
    .update({
      title: summary.title,
      transcript,
      summary: summary.summary,
      decisions: summary.decisions,
      action_items: summary.action_items,
      language: summary.language,
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("id", meeting.id)
    .select()
    .single();

  // ── Delete the audio blob — transcript persists, audio is ephemeral ───────
  await deleteBlob();

  return NextResponse.json({
    meeting: finalized,
    tasks: createdTasks,
  });
}
