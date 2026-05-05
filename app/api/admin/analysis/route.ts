import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import Groq from "groq-sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_EMAIL = "yorohn@duck.com";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const ANALYSIS_SYSTEM = `You are a sharp product analyst and advisor for JustDilo, a voice-first AI task manager.

WHAT JUSTDILO DOES:
Users hold Space or tap a mic button, speak tasks/reminders in English, Spanish, or Spanglish.
Whisper (Groq) transcribes the audio → Llama 3.3 70B extracts structured tasks with groups, dates, priorities.
Available on iPhone, Mac, and web. Target: busy professionals and bilingual users in Latin America / US.

THE AI PIPELINE:
1. Audio → Whisper transcription (voice) OR direct text (QuickAdd)
2. Transcript → Llama 3.3 70B intent detection + task extraction
3. Intents: CREATE_TASK, UPDATE_TASK, DELETE_TASK, COMPLETE_TASK, QUERY_TASKS
4. Tasks inserted into Supabase with group_name, due_date, priority, category

Analyze the provided metrics and return ONLY valid JSON — no markdown, no explanation:
{
  "health_score": <0-100 integer>,
  "health_label": "Critical | Needs Work | Decent | Good | Excellent",
  "executive_summary": "<2-3 sentences: what's working, what's broken, overall trajectory>",
  "critical_issues": [
    {
      "title": "<short problem name>",
      "severity": "high | medium | low",
      "evidence": "<specific numbers from the data>",
      "root_cause": "<why this is happening>",
      "fix": "<specific, concrete action: change X in the UI/prompt/code>"
    }
  ],
  "wins": [
    { "title": "<what's working>", "evidence": "<numbers>" }
  ],
  "quick_wins": [
    {
      "action": "<specific thing to do>",
      "effort": "<hours>",
      "expected_impact": "<what metric improves and by how much>"
    }
  ],
  "prompt_improvements": [
    "<specific text suggestion to add/change in the AI system prompt>"
  ],
  "weekly_priority": "<the ONE most important thing to focus on this week and why>",
  "watch_next_week": [
    "<metric to track to know if things improved>"
  ]
}`;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const stats = await req.json();

  const { aiQuality: q, behavior: b, totals: t, cost: c } = stats;

  const metricsText = `
=== PLATFORM HEALTH (last 7 days) ===
Total captures: ${t?.captures7d ?? "?"}
Total tasks created: ${t?.tasks7d ?? "?"}
Daily active users (DAU): ${b?.dau ?? "?"}
Weekly active users (WAU): ${b?.wau ?? "?"}
DAU/WAU ratio: ${b?.wauRatio ? (b.dauWauRatio * 100).toFixed(1) : b?.dauWauRatio != null ? (b.dauWauRatio * 100).toFixed(1) : "?"}% (healthy >40%)
Total unique users ever: ${t?.uniqueUsers ?? "?"}
Active today: ${t?.uniqueUsersToday ?? "?"}

=== USER RETENTION (last 14 days) ===
New users this week: ${b?.newUsers7d ?? "?"}
Returning users (active both weeks): ${b?.returningUsers7d ?? "?"}
Users from prev week: ${b?.week1UserCount ?? "?"}
Week-over-week retention: ${b?.retentionRate != null ? (b.retentionRate * 100).toFixed(1) : "?"}% (healthy >50%)
Task completion rate: ${b?.completionRate != null ? (b.completionRate * 100).toFixed(1) : "?"}%

=== AI QUALITY (last 30 days) ===
Total captures analyzed: ${q?.totalCaptures30d ?? "?"}
Captures that produced ≥1 task: ${q?.capturesWithTasks ?? "?"}
Conversion rate (capture → task): ${q?.conversionRate != null ? (q.conversionRate * 100).toFixed(1) : "?"}% (healthy >75%)
Empty captures (0 tasks extracted): ${q?.emptyRate != null ? (q.emptyRate * 100).toFixed(1) : "?"}%
Average tasks per successful capture: ${q?.avgTasksPerCapture != null ? q.avgTasksPerCapture.toFixed(1) : "?"}

=== USAGE BEHAVIOR ===
Voice (mic) captures: ${q?.voicePct != null ? (q.voicePct * 100).toFixed(1) : "?"}%
Text (QuickAdd) captures: ${q?.textPct != null ? (q.textPct * 100).toFixed(1) : "?"}%
Language — English: ${q?.langEnPct != null ? (q.langEnPct * 100).toFixed(1) : "?"}% | Spanish: ${q?.langEsPct != null ? (q.langEsPct * 100).toFixed(1) : "?"}% | Mixed: ${q?.langMixedPct != null ? (q.langMixedPct * 100).toFixed(1) : "?"}%
Peak usage hour: ${b?.peakHour != null ? `${b.peakHour}:00 (${b.peakHourCount} captures)` : "?"}

=== COST ===
Estimated daily cost: $${c?.estimated_daily_usd?.toFixed(4) ?? "?"} (LLM only, Whisper is free)
Cost per capture: $${c?.per_capture_usd?.toFixed(5) ?? "?"}
`.trim();

  let raw = "{}";
  try {
    const r = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM },
        { role: "user", content: `Analyze these metrics and return JSON:\n\n${metricsText}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000,
    });
    raw = r.choices[0]?.message?.content ?? "{}";
  } catch (e) {
    console.error("[admin/analysis] Groq call failed:", e);
    return NextResponse.json({ error: "Analysis failed. Try again." }, { status: 502 });
  }

  try {
    return NextResponse.json({ analysis: JSON.parse(raw), generated_at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Could not parse analysis response." }, { status: 500 });
  }
}
