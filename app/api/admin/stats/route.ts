import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ADMIN_EMAIL = "yorohn@duck.com";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [capturesRes, tasksRes, recentCapturesRes, totalUsersRes] = await Promise.all([
    // All captures last 7 days (all users)
    admin.from("captures").select("created_at, user_id").gte("created_at", since7d),
    // All tasks created last 7 days (all users)
    admin.from("tasks").select("created_at, user_id").gte("created_at", since7d),
    // Last 30 captures with transcript for history view
    admin.from("captures")
      .select("id, created_at, user_id, transcript")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(30),
    // Total unique users ever
    admin.from("captures").select("user_id"),
  ]);

  const captures = capturesRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const recentCaptures = recentCapturesRes.data ?? [];
  const allCaptures = totalUsersRes.data ?? [];

  // Group by day
  function groupByDay(rows: { created_at: string }[]) {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      map[day] = (map[day] ?? 0) + 1;
    }
    // Last 7 days in order
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      days.push({ date: d, count: map[d] ?? 0 });
    }
    return days;
  }

  const capturesByDay = groupByDay(captures);
  const tasksByDay = groupByDay(tasks);
  const totalCaptures7d = captures.length;
  const totalTasks7d = tasks.length;
  const uniqueUsers = new Set(allCaptures.map((c: any) => c.user_id)).size;
  const uniqueUsersToday = new Set(
    captures.filter((c: any) => c.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10))
      .map((c: any) => c.user_id)
  ).size;

  // Cost estimate (Groq whisper free, llama-3.3-70b ~$0.59/1M in + $0.79/1M out)
  // ~2300 tokens in + ~350 tokens out per capture
  const costPerCapture = (2300 * 0.59 + 350 * 0.79) / 1_000_000;
  const estimatedCost7d = totalCaptures7d * costPerCapture;
  const estimatedCostDay = (totalCaptures7d / 7) * costPerCapture;

  return NextResponse.json({
    capturesByDay,
    tasksByDay,
    totals: {
      captures7d: totalCaptures7d,
      tasks7d: totalTasks7d,
      uniqueUsers,
      uniqueUsersToday,
    },
    cost: {
      per_capture_usd: costPerCapture,
      estimated_7d_usd: estimatedCost7d,
      estimated_daily_usd: estimatedCostDay,
      note: "Groq Whisper is free. Cost = LLM only (llama-3.3-70b-versatile).",
    },
    recentCaptures: recentCaptures.map((c: any) => ({
      id: c.id,
      created_at: c.created_at,
      user_id: c.user_id,
      transcript_snippet: (c.transcript ?? "").slice(0, 120),
      transcript_length: (c.transcript ?? "").length,
    })),
  });
}
