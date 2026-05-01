import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { extractTasks, resolveDue, answerQuestion } from "@/lib/ai";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function normStr(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function isDuplicate(t: string, existing: string[]) {
  const n = normStr(t);
  return existing.some((e) => {
    const ex = normStr(e);
    if (n === ex) return true;
    const nW = new Set(n.split(" "));
    const eW = ex.split(" ");
    return eW.filter((w) => nW.has(w)).length / Math.max(nW.size, eW.length) >= 0.8;
  });
}

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

function matchTasks(allTasks: Task[], keywords: string[], targetGroup: string | null | undefined): Task[] {
  const kws = keywords.map((k) => normStr(k)).filter(Boolean);
  const grp = targetGroup ? normStr(targetGroup) : null;
  return allTasks.filter((t) => {
    const title = normStr(t.title);
    const group = normStr(t.group_name ?? "");
    const groupMatch = grp ? (group.includes(grp) || grp.includes(group)) : false;
    if (grp) {
      if (!groupMatch) return false;
      if (kws.length === 0) return true;
      return kws.some((k) => title.includes(k));
    }
    if (kws.length === 0) return false;
    return kws.some((k) => title.includes(k));
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text, utcOffset = 0 } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "no text" }, { status: 400 });

  const { data: capture, error: captureErr } = await supabase
    .from("captures")
    .insert({ user_id: user.id, transcript: text, raw_input: text })
    .select().single();
  if (captureErr) console.error("[process-text] captures insert error:", captureErr.message);

  let result: Awaited<ReturnType<typeof extractTasks>>;
  try {
    result = await extractTasks(text);
  } catch (e) {
    console.error("extract failed", e);
    return NextResponse.json({ error: "AI couldn't process your request. Please try again." }, { status: 502 });
  }

  const intent = result.intent ?? "CREATE_TASK";

  // ── Non-CREATE intents ────────────────────────────────────────────────────

  if (intent !== "CREATE_TASK") {
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
        const answer = await answerQuestion(text, context);
        return NextResponse.json({ intent, answer });
      } catch {
        return NextResponse.json({ intent, answer: null });
      }
    }

    if (!matched.length) {
      return NextResponse.json({ intent, updated_tasks: [], deleted_task_ids: [], completed_task_ids: [], not_found: true });
    }

    if (intent === "UPDATE_TASK") {
      const patch: Partial<Task> = {};
      if (result.update_due) {
        const resolved = resolveDue(result.update_due, utcOffset);
        if (resolved) patch.due_date = resolved.toISOString();
      }
      if (result.update_title) patch.title = result.update_title;
      if (result.update_priority) patch.priority = result.update_priority;
      if (Object.keys(patch).length > 0) {
        await Promise.all(matched.map((t) =>
          supabase.from("tasks").update(patch).eq("id", t.id).eq("user_id", user.id)
        ));
      }
      return NextResponse.json({ intent, updated_tasks: matched.map((t) => ({ ...t, ...patch })), deleted_task_ids: [], completed_task_ids: [] });
    }

    if (intent === "DELETE_TASK") {
      const ids = matched.map((t) => t.id);
      await Promise.all(ids.map((id) => supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id)));
      return NextResponse.json({ intent, updated_tasks: [], deleted_task_ids: ids, completed_task_ids: [] });
    }

    if (intent === "COMPLETE_TASK") {
      const ids = matched.map((t) => t.id);
      await Promise.all(ids.map((id) => supabase.from("tasks").update({ completed: true }).eq("id", id).eq("user_id", user.id)));
      return NextResponse.json({ intent, updated_tasks: [], deleted_task_ids: [], completed_task_ids: ids });
    }
  }

  // ── CREATE_TASK flow ──────────────────────────────────────────────────────

  const { groups, overall_summary } = result;

  const { data: recent } = await supabase
    .from("tasks").select("title, group_name").eq("user_id", user.id).eq("completed", false);

  const existingTitles = (recent ?? []).map((t: any) => t.title as string);
  const existingGroups = [...new Set((recent ?? []).map((t: any) => t.group_name as string).filter(Boolean))];

  let duplicatesSkipped = 0;
  const rows = groups.flatMap((g) => {
    const resolvedGroupName = normalizeGroupName(g.name ?? "General", existingGroups);
    return g.tasks.filter((t) => {
      const title = typeof t === "string" ? t : t.title;
      if (isDuplicate(title, existingTitles)) { duplicatesSkipped++; return false; }
      return true;
    }).map((t) => {
      const title = typeof t === "string" ? t : t.title;
      const note = typeof t === "object" && t.note ? t.note : null;
      const taskDue = typeof t === "object" && t.due ? t.due : null;
      const due_date = resolveDue(taskDue ?? g.due ?? null, utcOffset)?.toISOString() ?? null;
      return {
        user_id: user.id,
        capture_id: capture?.id ?? null,
        title,
        group_name: resolvedGroupName,
        summary: note || g.summary || null,
        due_date,
        priority: g.priority ?? null,
        category: g.category ?? null,
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
      console.error("[process-text] tasks insert error:", insertErr.message);
      return NextResponse.json({ error: `DB error: ${insertErr.message}` }, { status: 500 });
    }
    inserted = data ?? [];
  }

  console.log("[process-text] CREATE_TASK: groups=%d tasks_inserted=%d dupes=%d", groups.length, inserted.length, duplicatesSkipped);
  return NextResponse.json({
    intent,
    overall_summary,
    groups,
    tasks: inserted,
    duplicates_skipped: duplicatesSkipped,
    updated_tasks: [],
    deleted_task_ids: [],
    completed_task_ids: [],
  });
}
