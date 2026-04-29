import Groq from "groq-sdk";
import OpenAI from "openai";
import { z } from "zod";
import type { TaskCategory } from "./types";

const provider = process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "openai");

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export async function transcribeAudio(file: File): Promise<string> {
  if (provider === "groq" && groq) {
    const r = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "text",
      prompt: "Task list, reminders, calls, meetings, deadlines. May include English, Spanish, or mixed speech.",
    } as any);
    return typeof r === "string" ? r : (r as any).text ?? "";
  }
  if (!openai) throw new Error("No AI provider configured");
  const r = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    prompt: "Task list, reminders, calls, meetings, deadlines. May include English, Spanish, or mixed speech.",
  });
  return r.text;
}

const VALID_CATEGORIES = ["personal","business","health","finance","social","home","travel","shopping"] as const;

export const TaskGroupSchema = z.object({
  intent: z.enum(["CREATE_TASK","UPDATE_TASK","DELETE_TASK","COMPLETE_TASK","QUERY_TASKS"]).default("CREATE_TASK"),
  overall_summary: z.string().optional().default(""),
  // For UPDATE/DELETE/COMPLETE/QUERY intents:
  target_task_keywords: z.array(z.string()).optional().default([]),
  target_group: z.string().nullable().optional(),
  update_due: z.string().nullable().optional(),
  update_title: z.string().nullable().optional(),
  update_priority: z.enum(["low","med","high"]).nullable().optional(),
  update_completed: z.boolean().nullable().optional(),
  answer: z.string().nullable().optional(),
  // For CREATE_TASK:
  groups: z.array(
    z.object({
      name: z.string().nullable().optional().transform((v) => v ?? "General"),
      summary: z.string().optional().default(""),
      due: z.string().nullable().optional(),
      tasks: z.array(z.string()).default([]),
      priority: z
        .union([z.enum(["low","med","high"]), z.string()])
        .nullable()
        .optional()
        .transform((v) => {
          if (v === "null" || v === null || v === undefined) return null;
          if (v === "low" || v === "med" || v === "high") return v;
          return null;
        }),
      recurring: z.string().nullable().optional(),
      category: z
        .string()
        .nullable()
        .optional()
        .transform((v): TaskCategory | null => {
          if (!v) return null;
          return VALID_CATEGORIES.includes(v as TaskCategory) ? (v as TaskCategory) : null;
        }),
    }),
  ).default([]),
});
export type TaskGroups = z.infer<typeof TaskGroupSchema>;

const SYSTEM = `You are an elite executive assistant for a voice task manager.
You understand English, Spanish, and Spanglish naturally. Never fail on mixed-language input.

━━ INTENT DETECTION ━━
FIRST classify the command into ONE intent:
- CREATE_TASK: Adding new tasks (default for most commands)
- UPDATE_TASK: Correcting or changing an existing task
  Examples: "DJ John is not at 4 AM it's 4 PM", "change dentist to Friday", "move Marc to 5pm"
- DELETE_TASK: Removing a task
  Examples: "remove send invoice from Marc", "delete the dentist task", "quita lo de John"
- COMPLETE_TASK: Marking a task as done
  Examples: "mark grocery done", "I finished gym", "tacha lo del dentista", "ya hice lo de Marc"
- QUERY_TASKS: Asking about tasks
  Examples: "what do I have today?", "¿qué tengo pendiente?", "do I have anything with John?"

For UPDATE/DELETE/COMPLETE: populate target_task_keywords and target_group. Leave groups=[].
For QUERY: populate answer with a question template for the AI to answer. Leave groups=[].
For CREATE_TASK: populate groups[]. Leave target fields null/empty.

━━ CRITICAL TIME RULES ━━
- PM = PM. AM = AM. NEVER confuse them.
- "at 4 PM" → 4pm. "at 4 AM" → 4am. "cuatro PM" → 4pm. "a las 4 PM" → 4pm.
- "this afternoon at 4" → 4pm. "tonight at 8" → 8pm. "morning at 8" → 8am.
- "noon" / "mediodía" → 12pm. "midnight" / "medianoche" → 12am.
- When only "at 4" with no AM/PM: hours 1–6 → PM. Hours 7–11 → AM.
- ALWAYS write the full time in due: "today at 4pm" not just "today at 4".
- "a las" = "at" in Spanish. "a las 4pm" = at 4pm.

━━ MULTILINGUAL TEMPORAL WORDS ━━
- mañana = tomorrow (NOT morning). hoy = today.
- lunes=Monday, martes=Tuesday, miércoles=Wednesday, jueves=Thursday, viernes=Friday, sábado=Saturday, domingo=Sunday.
- "por la mañana" / "en la mañana" = in the morning (time context).
- "próxima semana" / "la próxima semana" = next week.
- "esta semana" = this week.

━━ CREATE_TASK RULES ━━
- Return valid JSON only.
- Group related tasks by person/project/context.
- Write overall_summary (1-2 sentences).
- Keep task titles concise and verb-first ("Send invoice", "Call client").
- "due" must capture FULL time: "today at 3pm", "tomorrow at 4pm". If no date/time → null.
- Detect priority: urgent/ASAP/important/critical → "high". Otherwise null.
- Detect recurring: "every Monday", "daily", "weekly" → set recurring string. Otherwise null.
- If unclear noise or no actionable content → groups: [].
- Smart task expansion: break complex vague tasks into logical sub-steps.

━━ CATEGORY DETECTION ━━
personal, business, health, finance, social, home, travel, shopping. Default: personal.

━━ RESPONSE FORMAT ━━
Return ONLY this exact JSON — no markdown, no explanation:
{
  "intent": "CREATE_TASK",
  "overall_summary": "...",
  "target_task_keywords": [],
  "target_group": null,
  "update_due": null,
  "update_title": null,
  "update_priority": null,
  "update_completed": null,
  "answer": null,
  "groups": [
    {
      "name": "Group name",
      "summary": "One short sentence",
      "due": "tomorrow at 4pm",
      "priority": "high" | "med" | "low" | null,
      "recurring": null,
      "category": "business",
      "tasks": ["Task one", "Task two"]
    }
  ]
}`;

function safeParseJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) try { return JSON.parse(fenced[1].trim()); } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  throw new Error("Could not parse AI response as JSON");
}

async function callGroq(messages: { role: "system" | "user"; content: string }[]): Promise<string> {
  if (!groq) throw new Error("Groq not configured");
  const r = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
  });
  return r.choices[0]?.message?.content ?? "{}";
}

async function callOpenAI(messages: { role: "system" | "user"; content: string }[]): Promise<string> {
  if (!openai) throw new Error("OpenAI not configured");
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
  });
  return r.choices[0]?.message?.content ?? "{}";
}

export async function extractTasks(transcript: string): Promise<TaskGroups> {
  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "user" as const, content: transcript },
  ];

  let raw: string;
  let usedProvider = "";
  try {
    if (provider === "groq" && groq) {
      raw = await callGroq(messages);
      usedProvider = "groq";
    } else if (openai) {
      raw = await callOpenAI(messages);
      usedProvider = "openai";
    } else {
      throw new Error("No AI provider configured");
    }
  } catch (primaryErr) {
    console.warn("[ai] primary provider failed, trying fallback:", (primaryErr as Error).message);
    try {
      if (provider === "groq" && openai) {
        raw = await callOpenAI(messages);
        usedProvider = "openai-fallback";
      } else if (groq) {
        raw = await callGroq(messages);
        usedProvider = "groq-fallback";
      } else {
        throw primaryErr;
      }
    } catch (fallbackErr) {
      console.error("[ai] fallback also failed:", (fallbackErr as Error).message);
      throw primaryErr;
    }
  }

  console.log("[ai] extractTasks via", usedProvider, "raw length:", raw.length);
  const parsed = TaskGroupSchema.safeParse(safeParseJSON(raw));
  if (!parsed.success) {
    console.error("TaskGroupSchema validation failed:", parsed.error.issues, "raw:", raw.slice(0, 300));
    return { intent: "CREATE_TASK", overall_summary: "", groups: [], target_task_keywords: [] };
  }
  return parsed.data;
}

const ASSISTANT_SYSTEM = `You are a personal task assistant. Answer the user's question about their tasks in 1-3 short conversational sentences.
Be direct and specific — mention names, times, and priorities when relevant.
Respond in the SAME LANGUAGE the user asked in.
Do NOT use markdown, bullet points, or lists — only natural spoken sentences.`;

export async function answerQuestion(question: string, tasksContext: string): Promise<string> {
  const messages = [
    { role: "system" as const, content: ASSISTANT_SYSTEM },
    { role: "user" as const, content: `Tasks:\n${tasksContext}\n\nQuestion: ${question}` },
  ];

  const call = async () => {
    if (provider === "groq" && groq) {
      const r = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages, temperature: 0.3, max_tokens: 160 });
      return r.choices[0]?.message?.content ?? "";
    }
    if (openai) {
      const r = await openai.chat.completions.create({ model: "gpt-4o-mini", messages, temperature: 0.3, max_tokens: 160 });
      return r.choices[0]?.message?.content ?? "";
    }
    throw new Error("No AI provider configured");
  };

  try {
    return (await call()).trim();
  } catch (e) {
    console.error("[ai] answerQuestion failed:", e);
    throw e;
  }
}

// Days of week — English + Spanish. Module-level so not recreated per call.
const WEEK_DAYS: [number, string[]][] = [
  [0, ["sunday", "domingo"]],
  [1, ["monday", "lunes"]],
  [2, ["tuesday", "martes"]],
  [3, ["wednesday", "miércoles", "miercoles"]],
  [4, ["thursday", "jueves"]],
  [5, ["friday", "viernes"]],
  [6, ["saturday", "sábado", "sabado"]],
];

function extractTime(s: string): { hours: number; minutes: number } | null {
  // Explicit 12h AM/PM — highest priority
  const t12 = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (t12) {
    let h = parseInt(t12[1]);
    const m = parseInt(t12[2] ?? "0");
    const ampm = t12[3].toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { hours: h, minutes: m };
  }
  // 24h format
  const t24 = s.match(/(\d{1,2}):(\d{2})/);
  if (t24) return { hours: parseInt(t24[1]), minutes: parseInt(t24[2]) };
  // Named time words (NOTE: bare "mañana" = tomorrow, not morning — excluded here)
  if (s.includes("midnight") || s.includes("medianoche")) return { hours: 0, minutes: 0 };
  if (s.includes("noon") || s.includes("midday") || s.includes("mediodía") || s.includes("mediodia")) return { hours: 12, minutes: 0 };
  if (s.includes("morning") || s.includes("por la mañana") || s.includes("en la mañana")) return { hours: 9, minutes: 0 };
  if (s.includes("afternoon") || s.includes("tarde")) return { hours: 14, minutes: 0 };
  if (s.includes("tonight") || s.includes("evening") || s.includes("noche")) return { hours: 20, minutes: 0 };
  if (s.includes("night")) return { hours: 20, minutes: 0 };
  // Bare hour after "at" or "a las" — infer AM/PM by context
  const bareHour = s.match(/(?:at|a las|@)\s*(\d{1,2})(?!\s*:\d{2}|\s*[ap]m)/i);
  if (bareHour) {
    const h = parseInt(bareHour[1]);
    if (h >= 1 && h <= 6) return { hours: h + 12, minutes: 0 }; // 1–6 → PM
    if (h >= 7 && h <= 11) return { hours: h, minutes: 0 };      // 7–11 → AM
    if (h === 12) return { hours: 12, minutes: 0 };               // 12 → noon
  }
  return null;
}

export function resolveDue(
  due: string | null | undefined,
  utcOffsetMinutes = 0,
): Date | null {
  if (!due) return null;
  const now = new Date();
  const lower = due.toLowerCase().trim();

  function applyTime(d: Date, time: { hours: number; minutes: number } | null): Date {
    const out = new Date(d);
    // null = no explicit time. Use 23:59 local as sentinel so undated tasks
    // sort AFTER timed tasks and never collide with a real scheduled hour.
    const { hours, minutes } = time ?? { hours: 23, minutes: 59 };
    const utcH = hours - utcOffsetMinutes / 60;
    out.setUTCHours(utcH, minutes, 0, 0);
    return out;
  }

  const time = extractTime(lower);
  const base = new Date(now);

  const hasTomorrow = lower.includes("tomorrow") || lower.includes("mañana");
  const hasToday = lower.includes("today") || lower.includes("hoy");
  // A named day or week reference must NOT be mistaken for "today"
  const hasDayName = WEEK_DAYS.some(([, names]) => names.some((n) => lower.includes(n)));
  const hasWeekRef = lower.includes("next week") || lower.includes("this week") ||
    lower.includes("próxima semana") || lower.includes("proxima semana") ||
    lower.includes("esta semana");

  // "today at 3pm" OR bare time with no other anchor → today
  // But NOT if a specific day name or week reference is present
  if (hasToday || (time && !hasTomorrow && !hasDayName && !hasWeekRef &&
      !lower.includes("yesterday") && !lower.includes("ayer"))) {
    return applyTime(base, time ?? { hours: 9, minutes: 0 });
  }
  if (hasTomorrow) {
    base.setDate(base.getDate() + 1);
    return applyTime(base, time);
  }
  if (lower.includes("next week") || lower.includes("próxima semana") || lower.includes("proxima semana") || lower.includes("la próxima semana")) {
    base.setDate(base.getDate() + 7);
    return applyTime(base, time);
  }
  if (lower.includes("this week") || lower.includes("esta semana")) {
    base.setDate(base.getDate() + 3);
    return applyTime(base, time);
  }

  for (const [dayNum, names] of WEEK_DAYS) {
    if (names.some((n) => lower.includes(n))) {
      base.setDate(base.getDate() + ((dayNum + 7 - base.getDay()) % 7 || 7));
      return applyTime(base, time);
    }
  }

  const iso = new Date(due);
  if (!isNaN(iso.getTime())) return applyTime(iso, time);

  return null;
}
