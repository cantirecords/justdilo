import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { extractTasks, resolveDue, transcribeAudio, answerQuestion } from "@/lib/ai";
import { detectCategory } from "@/lib/detectCategory";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function normStr(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function isDuplicate(newTitle: string, existingTitles: string[]): boolean {
  const n = normStr(newTitle);
  return existingTitles.some((e) => {
    const ex = normStr(e);
    if (n === ex) return true;
    const nWords = new Set(n.split(" "));
    const eWords = ex.split(" ");
    const matches = eWords.filter((w) => nWords.has(w)).length;
    return matches / Math.max(nWords.size, eWords.length) >= 0.8;
  });
}

// Normalize AI-returned group name to match an existing group (case/punctuation insensitive)
function normalizeGroupName(name: string, existingGroups: string[]): string {
  const n = normStr(name);
  for (const g of existingGroups) {
    const e = normStr(g);
    if (n === e) return g;
    const nW = new Set(n.split(" "));
    const eW = new Set(e.split(" "));
    const inter = [...nW].filter((w) => eW.has(w));
    if (nW.size > 0 && eW.size > 0 && inter.length / Math.max(nW.size, eW.size) >= 0.7) return g;
  }
  return name;
}

// Find tasks that match keywords + optional group.
// Group is the primary scope — if provided, tasks MUST belong to that group.
// Keywords then refine within the group (or target title directly if no group).
function matchTasks(allTasks: Task[], keywords: string[], targetGroup: string | null | undefined): Task[] {
  const kws = keywords.map((k) => normStr(k)).filter(Boolean);
  const grp = targetGroup ? normStr(targetGroup) : null;

  return allTasks.filter((t) => {
    const title = normStr(t.title);
    const group = normStr(t.group_name ?? "");
    const groupMatch = grp ? (group.includes(grp) || grp.includes(group)) : false;

    if (grp) {
      if (!groupMatch) return false;          // group given but doesn't match → skip
      if (kws.length === 0) return true;      // group matches, no keywords → all group tasks
      return kws.some((k) => title.includes(k)); // group matches + keyword in title
    }
    // No group: keyword must appear in the task title (not just group name)
    if (kws.length === 0) return false;
    return kws.some((k) => title.includes(k));
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const utcOffset = Number(form.get("utcOffset") ?? 0);
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "no audio" }, { status: 400 });
  }

  const path = `${user.id}/${Date.now()}-${audio.name || "rec.webm"}`;
  const { error: uploadErr } = await supabase.storage
    .from("captures")
    .upload(path, audio, { contentType: audio.type || "audio/webm", upsert: false });
  if (uploadErr) console.warn("upload failed:", uploadErr.message);

  let transcript = "";
  let txProvider = "groq";
  let txMs = 0;
  try {
    const tx = await transcribeAudio(audio);
    transcript = tx.text;
    txProvider = tx.provider;
    txMs = tx.ms;
  } catch (e: any) {
    return NextResponse.json(
      { error: "Couldn't hear clearly. Try again.", detail: e?.message },
      { status: 422 },
    );
  }

  const { data: capture, error: captureErr } = await supabase
    .from("captures")
    .insert({ user_id: user.id, audio_url: uploadErr ? null : path, transcript, raw_input: transcript })
    .select()
    .single();
  if (captureErr) console.error("[process-voice] captures insert error:", captureErr.message);

  let result: Awaited<ReturnType<typeof extractTasks>>;
  try {
    result = await extractTasks(transcript);
  } catch (e) {
    console.error("extract failed", e);
    return NextResponse.json({ error: "AI couldn't process your request. Please try again.", transcript }, { status: 502 });
  }

  const timing = { transcription_ms: txMs, extraction_ms: result._ms };
  const aiProvider = txProvider;

  const intent = result.intent ?? "CREATE_TASK";

  // ── Non-CREATE intents: editing existing tasks ────────────────────────────

  if (intent !== "CREATE_TASK") {
    // Fetch recent open tasks for matching
    const { data: openTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("completed", false)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    const allTasks = (openTasks ?? []) as Task[];
    const keywords = result.target_task_keywords ?? [];
    const targetGroup = result.target_group ?? null;
    const matched = matchTasks(allTasks, keywords, targetGroup);

    if (intent === "QUERY_TASKS") {
      const context = allTasks
        .slice(0, 40)
        .map((t) => `${t.group_name ? `[${t.group_name}] ` : ""}${t.title}${t.due_date ? ` (due: ${t.due_date})` : ""}`)
        .join("\n");
      try {
        const answer = await answerQuestion(transcript, context);
        return NextResponse.json({ intent, transcript, answer, provider: aiProvider, timing });
      } catch {
        return NextResponse.json({ intent, transcript, answer: null, provider: aiProvider, timing });
      }
    }

    if (!matched.length) {
      console.log("[process-voice] intent=%s but no matching tasks found", intent);
      return NextResponse.json({ intent, transcript, updated_tasks: [], deleted_task_ids: [], completed_task_ids: [], not_found: true, provider: aiProvider, timing });
    }

    if (intent === "UPDATE_TASK") {
      const patch: Partial<Task> = {};
      if (result.update_due) {
        const resolved = resolveDue(result.update_due, utcOffset);
        if (resolved) patch.due_date = resolved.toISOString();
      }
      if (result.update_title) patch.title = result.update_title;
      if (result.update_priority) patch.priority = result.update_priority;
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ intent, transcript, updated_tasks: [], deleted_task_ids: [], completed_task_ids: [], provider: aiProvider, timing });
      }
      const ids = matched.map((t) => t.id);
      await Promise.all(ids.map((id) =>
        supabase.from("tasks").update(patch).eq("id", id).eq("user_id", user.id)
      ));
      const updated_tasks = matched.map((t) => ({ ...t, ...patch }));
      console.log("[process-voice] UPDATE_TASK: updated %d tasks", ids.length);
      return NextResponse.json({ intent, transcript, updated_tasks, deleted_task_ids: [], completed_task_ids: [], provider: aiProvider, timing });
    }

    if (intent === "DELETE_TASK") {
      const ids = matched.map((t) => t.id);
      await Promise.all(ids.map((id) =>
        supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id)
      ));
      console.log("[process-voice] DELETE_TASK: deleted %d tasks", ids.length);
      return NextResponse.json({ intent, transcript, updated_tasks: [], deleted_task_ids: ids, completed_task_ids: [], provider: aiProvider, timing });
    }

    if (intent === "COMPLETE_TASK") {
      const ids = matched.map((t) => t.id);
      await Promise.all(ids.map((id) =>
        supabase.from("tasks").update({ completed: true }).eq("id", id).eq("user_id", user.id)
      ));
      console.log("[process-voice] COMPLETE_TASK: completed %d tasks", ids.length);
      return NextResponse.json({ intent, transcript, updated_tasks: [], deleted_task_ids: [], completed_task_ids: ids, provider: aiProvider, timing });
    }
  }

  // ── CREATE_TASK flow ──────────────────────────────────────────────────────

  const { groups, overall_summary } = result;

  // Fetch ALL open tasks for dedup + group normalization (no date cap — recurring tasks
  // older than 7 days were slipping through and creating duplicates)
  const { data: recentTasks } = await supabase
    .from("tasks")
    .select("title, group_name")
    .eq("user_id", user.id)
    .eq("completed", false);

  const existingTitles = (recentTasks ?? []).map((t: any) => t.title as string);
  const existingGroups = [...new Set((recentTasks ?? []).map((t: any) => t.group_name as string).filter(Boolean))];

  const recurringGroups: string[] = [];
  const duplicateCount = { n: 0 };

  const rows = groups.flatMap((g) => {
    if (g.recurring) recurringGroups.push(`${g.name}: ${g.recurring}`);
    const resolvedGroupName = normalizeGroupName(g.name ?? "General", existingGroups);
    return g.tasks
      .filter((t) => {
        const title = typeof t === "string" ? t : t.title;
        if (isDuplicate(title, existingTitles)) { duplicateCount.n++; return false; }
        return true;
      })
      .map((t) => {
        const title = typeof t === "string" ? t : t.title;
        const note = typeof t === "object" && t.note ? t.note : null;
        const taskDue = typeof t === "object" && t.due ? t.due : null;
        const due_date = resolveDue(taskDue ?? g.due ?? null, utcOffset)?.toISOString() ?? null;
        const category = g.category ?? detectCategory(resolvedGroupName) ?? detectCategory(title);
        return {
          user_id: user.id,
          capture_id: capture?.id ?? null,
          title,
          group_name: resolvedGroupName,
          summary: note || g.summary || null,
          due_date,
          priority: g.priority ?? null,
          category,
          completed: false,
        };
      });
  });

  let inserted: any[] = [];
  if (rows.length) {
    let { data, error: insertErr } = await supabase.from("tasks").insert(rows).select();
    if (insertErr?.message?.includes("schema cache")) {
      const safeRows = rows.map(({ category: _c, ...r }) => r);
      ({ data, error: insertErr } = await supabase.from("tasks").insert(safeRows).select());
    }
    if (insertErr) {
      console.error("[process-voice] tasks insert error:", insertErr.message, insertErr.code);
      return NextResponse.json({ error: `DB error: ${insertErr.message}`, transcript }, { status: 500 });
    }
    inserted = data ?? [];
  }

  console.log("[process-voice] CREATE_TASK: groups=%d tasks_inserted=%d dupes=%d", groups.length, inserted.length, duplicateCount.n);
  return NextResponse.json({
    intent,
    transcript,
    overall_summary,
    groups,
    tasks: inserted,
    duplicates_skipped: duplicateCount.n,
    recurring: recurringGroups,
    updated_tasks: [],
    deleted_task_ids: [],
    completed_task_ids: [],
    provider: aiProvider,
    timing,
  });
}
