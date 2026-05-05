import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { classifyFailure } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN_EMAIL = "yorohn@duck.com";

function detectLang(text: string): "es" | "en" | "mixed" {
  const es = /[¿¡áéíóúñüÁÉÍÓÚÑ]|\b(el|la|los|las|que|de|en|es|por|para|con|hoy|mañana|tareas|hacer|tengo|quiero|llamar|reunión|comprar)\b/i.test(text);
  const en = /\b(the|and|for|with|this|that|have|from|will|today|tomorrow|task|call|meeting|buy|send|finish|review)\b/i.test(text);
  if (es && en) return "mixed";
  if (es) return "es";
  return "en";
}

function groupByDay(rows: { created_at: string }[], days = 7) {
  const map: Record<string, number> = {};
  for (const r of rows) map[r.created_at.slice(0, 10)] = (map[r.created_at.slice(0, 10)] ?? 0) + 1;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, count: map[d] ?? 0 };
  });
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const now = Date.now();
  const since7d  = new Date(now - 7  * 86_400_000).toISOString();
  const since14d = new Date(now - 14 * 86_400_000).toISOString();
  const since30d = new Date(now - 30 * 86_400_000).toISOString();
  const since24h = new Date(now - 86_400_000).toISOString();
  const todayStr = new Date(now).toISOString().slice(0, 10);

  const [
    captures30dRes,
    captures14dRes,
    tasks30dRes,
    allTasksRes,
    recentCapturesRes,
    allCaptureUsersRes,
  ] = await Promise.all([
    admin.from("captures").select("id, user_id, created_at, transcript, audio_url").gte("created_at", since30d),
    admin.from("captures").select("user_id, created_at").gte("created_at", since14d),
    admin.from("tasks").select("id, capture_id, user_id, created_at, completed").gte("created_at", since30d),
    admin.from("tasks").select("id, completed, user_id"),
    admin.from("captures").select("id, created_at, user_id, transcript").gte("created_at", since30d).order("created_at", { ascending: false }).limit(30),
    admin.from("captures").select("user_id"),
  ]);

  const captures30d = (captures30dRes.data ?? []) as any[];
  const captures14d = (captures14dRes.data ?? []) as any[];
  const tasks30d    = (tasks30dRes.data ?? []) as any[];
  const allTasks    = (allTasksRes.data ?? []) as any[];
  const recent      = (recentCapturesRes.data ?? []) as any[];
  const allCapUsers = (allCaptureUsersRes.data ?? []) as any[];

  // ── Overview ─────────────────────────────────────────────────────────────
  const captures7d = captures14d.filter(c => c.created_at >= since7d);
  const capturesByDay = groupByDay(captures7d);
  const tasksByDay    = groupByDay(tasks30d.filter(t => t.created_at >= since7d));
  const totalCaptures7d = captures7d.length;
  const totalTasks7d    = tasks30d.filter(t => t.created_at >= since7d).length;
  const uniqueUsers = new Set(allCapUsers.map((c: any) => c.user_id)).size;
  const uniqueUsersToday = new Set(captures7d.filter(c => c.created_at.slice(0,10) === todayStr).map(c => c.user_id)).size;
  const costPerCapture = (2300 * 0.59 + 350 * 0.79) / 1_000_000;

  // ── AI Quality ───────────────────────────────────────────────────────────
  const tasksByCapture: Record<string, number> = {};
  for (const t of tasks30d) {
    if (t.capture_id) tasksByCapture[t.capture_id] = (tasksByCapture[t.capture_id] ?? 0) + 1;
  }

  const voiceCaptures = captures30d.filter(c => c.audio_url);
  const textCaptures  = captures30d.filter(c => !c.audio_url);
  const capturesWithTasks = captures30d.filter(c => (tasksByCapture[c.id] ?? 0) > 0);
  const totalTasksFromCaptures = Object.values(tasksByCapture).reduce((a: number, b: number) => a + b, 0);

  const conversionRate = captures30d.length ? capturesWithTasks.length / captures30d.length : 0;
  const emptyRate      = captures30d.length ? 1 - conversionRate : 0;
  const avgTasksPerCapture = capturesWithTasks.length ? totalTasksFromCaptures / capturesWithTasks.length : 0;

  let langEs = 0, langEn = 0, langMixed = 0;
  for (const c of captures30d) {
    const l = detectLang(c.transcript ?? "");
    if (l === "es") langEs++;
    else if (l === "mixed") langMixed++;
    else langEn++;
  }
  const langTotal = captures30d.length || 1;

  // ── User Behavior ─────────────────────────────────────────────────────────
  const dauUsers = new Set(captures30d.filter(c => c.created_at >= since24h).map(c => c.user_id)).size;
  const wauUsers = new Set(captures7d.map(c => c.user_id)).size;
  const dauWauRatio = wauUsers ? dauUsers / wauUsers : 0;

  // Retention: users from week 1 (14d–7d ago) who reappeared in week 2 (7d–now)
  const week1Users = new Set(captures14d.filter(c => c.created_at < since7d).map(c => c.user_id));
  const week2Users = new Set(captures7d.map(c => c.user_id));
  const returnedCount = [...week1Users].filter(u => week2Users.has(u)).length;
  const retentionRate = week1Users.size ? returnedCount / week1Users.size : 0;
  const newUsers7d = [...week2Users].filter(u => !week1Users.has(u)).length;

  // Peak hours (using local hour from UTC, approximate)
  const hourly = new Array(24).fill(0);
  for (const c of captures30d) {
    const h = new Date(c.created_at).getHours();
    hourly[h]++;
  }
  const peakHour = hourly.indexOf(Math.max(...hourly));

  // Task completion across all time
  const completionRate = allTasks.length ? allTasks.filter((t: any) => t.completed).length / allTasks.length : 0;

  // Voice vs text (30d)
  const voicePct = captures30d.length ? voiceCaptures.length / captures30d.length : 0;
  const textPct  = captures30d.length ? textCaptures.length / captures30d.length : 0;

  // Failure breakdown — classify empty captures
  const emptyCaps = captures30d.filter(c => (tasksByCapture[c.id] ?? 0) === 0);
  const failureMap: Record<string, number> = {};
  for (const c of emptyCaps) {
    const reason = classifyFailure(c.transcript ?? "");
    failureMap[reason] = (failureMap[reason] ?? 0) + 1;
  }

  // Corrections count
  const admin2 = createSupabaseAdmin();
  let correctionsCount = 0;
  try {
    const { count } = await admin2.from("prompt_corrections").select("*", { count: "exact", head: true });
    correctionsCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  return NextResponse.json({
    // Overview
    capturesByDay,
    tasksByDay,
    totals: { captures7d: totalCaptures7d, tasks7d: totalTasks7d, uniqueUsers, uniqueUsersToday },
    cost: {
      per_capture_usd: costPerCapture,
      estimated_7d_usd: totalCaptures7d * costPerCapture,
      estimated_daily_usd: (totalCaptures7d / 7) * costPerCapture,
      note: "Groq Whisper is free. Cost = LLM only (llama-3.3-70b-versatile).",
    },
    recentCaptures: recent.map((c: any) => ({
      id: c.id,
      created_at: c.created_at,
      user_id: c.user_id,
      transcript_snippet: (c.transcript ?? "").slice(0, 120),
      transcript_length: (c.transcript ?? "").length,
    })),

    // AI Quality (30d)
    aiQuality: {
      conversionRate,
      emptyRate,
      avgTasksPerCapture,
      voicePct,
      textPct,
      langEsPct:    langEs    / langTotal,
      langEnPct:    langEn    / langTotal,
      langMixedPct: langMixed / langTotal,
      totalCaptures30d: captures30d.length,
      capturesWithTasks: capturesWithTasks.length,
      voiceCaptures: voiceCaptures.length,
      textCaptures:  textCaptures.length,
      failureBreakdown: failureMap,
      emptyCount: emptyCaps.length,
      correctionsCount,
    },

    // Behavior
    behavior: {
      dau: dauUsers,
      wau: wauUsers,
      dauWauRatio,
      completionRate,
      retentionRate,
      newUsers7d,
      returningUsers7d: returnedCount,
      week1UserCount: week1Users.size,
      peakHour,
      peakHourCount: hourly[peakHour],
      hourlyDistribution: hourly,
    },
  });
}
