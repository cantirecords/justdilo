import Groq from "groq-sdk";
import OpenAI from "openai";
import { z } from "zod";
import type { TaskCategory } from "./types";

const provider = process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "openai");

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export async function transcribeAudio(file: File): Promise<{ text: string; provider: string; ms: number }> {
  const t0 = Date.now();
  if (provider === "groq" && groq) {
    const r = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "text",
      prompt: "Tasks, reminders, calls, meetings, deadlines, to-do items, appointments, errands. English, Spanish, or Spanglish. Capture every word precisely.",
    } as any);
    return { text: typeof r === "string" ? r : (r as any).text ?? "", provider: "groq", ms: Date.now() - t0 };
  }
  if (!openai) throw new Error("No AI provider configured");
  const r = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    prompt: "Tasks, reminders, calls, meetings, deadlines, to-do items, appointments, errands. English, Spanish, or Spanglish. Capture every word precisely.",
  });
  return { text: r.text, provider: "openai", ms: Date.now() - t0 };
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
      tasks: z.array(
        z.union([
          z.string().transform((t) => ({ title: t, note: null as string | null, due: null as string | null })),
          z.object({
            title: z.string(),
            note: z.string().nullable().optional().default(null),
            due: z.string().nullable().optional().default(null),
          }),
        ])
      ).default([]),
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
      // Team assignment — names spoken by user (e.g. ["Alice", "Bob"]). Resolved to members on the server.
      assignee_names: z.array(z.string()).optional().default([]),
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

━━ LANGUAGE RULE — NON-NEGOTIABLE ━━
DETECT the language the user is speaking. Output EVERYTHING in that SAME language.
- Spanish input → ALL titles, group names, notes, and summaries in SPANISH.
- English input → ALL titles, group names, notes, and summaries in ENGLISH.
- Spanglish → use whichever language is dominant.
- NEVER translate. NEVER switch languages. NEVER use English when the user spoke Spanish.
Spanish examples: "levantarse temprano", "comprar regalo", "preparar decoración", "Fiesta de mamá"
English examples: "Wake up early", "Buy gift", "Prepare decorations", "Mom's Party"
If the user says "levantarme temprano" → title MUST be "Levantarme temprano" NOT "Wake up early".
If the user says "comprar comida" → title MUST be "Comprar comida" NOT "Buy food".

━━ CREATE_TASK RULES ━━
- Return valid JSON only.
- Group related tasks by person/project/context.
- Write overall_summary (1-2 sentences) IN THE USER'S LANGUAGE.
- TITLE QUALITY — MOST IMPORTANT RULE:
  Titles must be self-contained context for a push notification. A user must understand WHAT the task is about WITHOUT seeing the due date, group, or note. Imagine the title appearing alone on a lockscreen at 5pm.
  • STRIP temporal words from titles. NEVER write the time/date inside the title — that lives in the "due" field. Forbidden in titles: today, tomorrow, tonight, this week, next week, on Monday, at 5pm, at 5:30, by Friday, in the morning, hoy, mañana, esta noche, esta semana, próxima semana, lunes, a las 5, por la mañana, etc.
  • BAD: "Tomorrow call Marc at 5:30 about invoice" → GOOD: "Call Marc about the invoice" (due: "tomorrow at 5:30pm")
  • BAD: "Meeting at 3pm with Sarah" → GOOD: "Meeting with Sarah" (due: "today at 3pm")
  • BAD: "5:30 dentist" → GOOD: "Dentist appointment" (due: "today at 5:30pm")
  • BAD: "Tuesday gym" → GOOD: "Go to the gym" (due: "next Tuesday")
  • Include the SUBJECT or PERSON — never just a verb alone. BAD: "Buy" → GOOD: "Buy groceries for dinner". BAD: "Call" → GOOD: "Call Marc about invoice".
  • Verb-first when natural. 5-9 words is the sweet spot. Spanish examples: "Pagar factura del proveedor", "Llamar a mamá por su cumpleaños". English examples: "Send invoice to Marc", "Pick up cake for the party".
  • Subtasks MUST stand alone — they get sent as their own notifications. NEVER write a single-word subtask like "milk" or "wine". Write "Buy milk for breakfast" / "Pick up wine for dinner".
  • Don't duplicate the group context in every subtask title. If the group is "Mom's birthday", a subtask is "Buy gift", not "Buy gift for Mom's birthday".
- Group names MUST be timeless. NEVER include relative time words in the name: no hoy, mañana, today, tomorrow, tonight, esta noche, esta semana, this week, next week, próxima semana, lunes, Monday, etc. The "due" field carries all timing. Examples: "Reuniones y tareas de mañana" → name: "Reuniones y tareas". "Tasks for today" → name: "Tasks". "Monday errands" → name: "Errands".
- Group "due": the main date/time anchor for the group (e.g. "tomorrow at 7pm").
- Task "due": if a specific subtask has its OWN time, set it on the task. Otherwise null (inherits group).
  Example: user says "levantarme a las 7am, comprar regalo a las 9am, recoger pastel a las 12pm, fiesta a las 7pm"
  → group due: "tomorrow at 7pm"
  → task "Levantarme": due "tomorrow at 7am"
  → task "Comprar regalo": due "tomorrow at 9am"
  → task "Recoger pastel": due "tomorrow at 12pm"
  → task "Iniciar fiesta": due null (inherits group 7pm)
- Detect priority: urgent/ASAP/important/critical/urgente/importante → "high". Otherwise null.
- Detect recurring: "every Monday", "daily", "weekly", "cada lunes", "diario" → set recurring string. Otherwise null.
- ALWAYS try to extract at least one task. Only return groups: [] if the transcript is pure noise, silence, or completely unintelligible (e.g., "um", "uh", "..."). If the user mentions ANYTHING — a person, place, action, event, idea — create a task for it.
- When input is vague (e.g., "I need to think about the presentation"), create a concrete task like "Review presentation ideas".
- Smart task expansion: break complex vague tasks into logical sub-steps.

━━ CATEGORY DETECTION ━━
personal, business, health, finance, social, home, travel, shopping. Default: personal.

━━ TEAM ASSIGNMENT (only when a team roster is provided in the user message) ━━
If a roster is listed (e.g. "TEAM MEMBERS: Alice, Bob"), check whether the user is
delegating a task to one or more of those names. Triggers like "tell Alice…", "have Bob…",
"ask Marc to…", "dile a Alicia…", "que Roberto…", "for Alice", "assign to Bob",
"Alice and Bob handle…", "both Alice and Carmen…".
- Set the group's "assignee_names" to an array of EXACT roster names (not spoken variants).
- Single person: assignee_names: ["Alice"]
- Multiple people: assignee_names: ["Alice", "Bob"]
- If the user says "team task" / "tarea del equipo" with no specific person, set assignee_names: [].
- If no team trigger is present, set assignee_names: [] (treated as personal).
- Only include names that are on the provided roster.

━━ PER-TASK NOTES ━━
Each task object must have a "title" and a short "note" (1 sentence, actionable context).
- "Cancel Splice subscription" → note: "Do after downloading content and using credits."
- "Send invoice to Marc" → note: "Include project hours and rate agreed on last call."
- Notes must add context, not just repeat the title. If no useful context, set note: null.

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
      "assignee_names": [],
      "tasks": [
        {"title": "Task one", "note": "Brief context or null", "due": "tomorrow at 7am"},
        {"title": "Task two", "note": null, "due": null}
      ]
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

export type ExtractResult = TaskGroups & { _provider: string; _ms: number };

export type Correction = {
  original_transcript: string;
  correct_intent: string;
  correct_tasks: any[];
  issue_type: string | null;
};

export function classifyFailure(transcript: string): string {
  const t = transcript.trim();
  const lower = t.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 5) return "too_short";
  if (/^(what|when|where|who|how|can you|do i|did|is there|are there|¿qué|¿cuándo|¿dónde|¿quién|¿cómo|¿cuántos)/i.test(t)) return "question";
  const fillerRatio = words.filter(w => /^(um+|uh+|ah+|mm+|hmm+|er+|eh+)$/i.test(w)).length / words.length;
  if (fillerRatio > 0.25) return "background_noise";
  if (!/\b(call|send|buy|make|create|add|remind|check|pay|schedule|meet|finish|complete|write|book|review|get|go|do|need|want|should|llamar|enviar|comprar|hacer|crear|agregar|recordar|revisar|pagar|reunión|terminar|escribir|reservar|necesito|quiero|ir|poner|mandar|hablar|ver|subir|bajar|preparar|organizar|limpiar)\b/i.test(lower)) return "no_action_verbs";
  if (words.length < 8) return "too_vague";
  return "unclear_intent";
}

function buildSystemWithCorrections(corrections: Correction[]): string {
  if (!corrections.length) return SYSTEM;
  const examples = corrections.slice(0, 12).map((c, i) => {
    const output = JSON.stringify({ intent: c.correct_intent, groups: c.correct_tasks });
    return `[${c.issue_type ?? "correction"}] Example ${i + 1}:\nUser said: "${c.original_transcript}"\nCorrect extraction: ${output}`;
  }).join("\n\n");
  return `${SYSTEM}\n\n━━ LEARNED CORRECTIONS — apply these exact patterns ━━\n${examples}\n━━ END CORRECTIONS ━━`;
}

export async function extractTasks(transcript: string, corrections: Correction[] = [], teamMembers: string[] = []): Promise<ExtractResult> {
  const userContent = teamMembers.length > 0
    ? `TEAM MEMBERS: ${teamMembers.join(", ")}\n\nTRANSCRIPT:\n${transcript}`
    : transcript;
  const messages = [
    { role: "system" as const, content: buildSystemWithCorrections(corrections) },
    { role: "user" as const, content: userContent },
  ];

  const t0 = Date.now();
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

  const _ms = Date.now() - t0;
  console.log("[ai] extractTasks via", usedProvider, "raw length:", raw.length, "ms:", _ms);
  const parsed = TaskGroupSchema.safeParse(safeParseJSON(raw));
  if (!parsed.success) {
    console.error("TaskGroupSchema validation failed:", parsed.error.issues, "raw:", raw.slice(0, 300));
    return { intent: "CREATE_TASK", overall_summary: "", groups: [], target_task_keywords: [], _provider: usedProvider, _ms };
  }
  return { ...parsed.data, _provider: usedProvider, _ms };
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

// Month names — English + Spanish (no accents folded).
const MONTHS: [number, string[]][] = [
  [0,  ["january", "enero"]],
  [1,  ["february", "febrero"]],
  [2,  ["march", "marzo"]],
  [3,  ["april", "abril"]],
  [4,  ["may", "mayo"]],
  [5,  ["june", "junio"]],
  [6,  ["july", "julio"]],
  [7,  ["august", "agosto"]],
  [8,  ["september", "septiembre", "setiembre"]],
  [9,  ["october", "octubre"]],
  [10, ["november", "noviembre"]],
  [11, ["december", "diciembre"]],
];

// Find an explicit "<month> <day>" or "<day> [de] <month>" anywhere in the text.
// Returns { month: 0-11, day: 1-31 } or null. Day is sanity-checked (1-31).
// When several dates appear ("move May 3 to June 7"), the first one in the
// text wins — not the first month in calendar order.
function extractMonthDay(s: string): { month: number; day: number } | null {
  let best: { month: number; day: number; index: number } | null = null;
  for (const [idx, names] of MONTHS) {
    for (const name of names) {
      // English: "may 23", "may 23rd"
      const enMatch = s.match(new RegExp(`\\b${name}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"));
      // Spanish: "23 de mayo", "23 mayo"
      const esMatch = s.match(new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+${name}\\b`, "i"));
      for (const m of [enMatch, esMatch]) {
        if (!m || m.index === undefined) continue;
        const day = parseInt(m[1], 10);
        if (day < 1 || day > 31) continue;
        if (!best || m.index < best.index) best = { month: idx, day, index: m.index };
      }
    }
  }
  return best ? { month: best.month, day: best.day } : null;
}

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

// Returns the UTC offset (minutes) for an IANA timezone at a specific moment.
// Positive = ahead of UTC (UTC+5 → 300), negative = behind (UTC-5 → -300).
// Uses the locale-string trick: server tz cancels out in the subtraction.
function tzOffsetAt(date: Date, tz: string): number {
  try {
    const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
    const localStr = date.toLocaleString("en-US", { timeZone: tz });
    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60_000;
  } catch {
    return 0;
  }
}

export function resolveDue(
  due: string | null | undefined,
  utcOffsetMinutes = 0,
  timezone?: string,
): Date | null {
  if (!due) return null;
  const now = new Date();
  const lower = due.toLowerCase().trim();

  // DST-safe offset: use IANA timezone when available, fall back to numeric offset.
  // The numeric offset is a snapshot of NOW and will be wrong after DST transitions.
  const getOffset = (date: Date): number =>
    timezone ? tzOffsetAt(date, timezone) : utcOffsetMinutes;

  // Derive the user's local "now".
  const localNow = new Date(now.getTime() + getOffset(now) * 60_000);

  // Midnight of today in the user's local timezone, expressed as UTC coordinates.
  const localTodayMidnight = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
  ));

  // Apply local hours to a local-midnight base, then convert to real UTC.
  // For the target date we re-derive the offset (handles DST across day boundaries).
  function applyTime(localMidnight: Date, time: { hours: number; minutes: number } | null): Date {
    const { hours, minutes } = time ?? { hours: 23, minutes: 59 };
    const localMs = localMidnight.getTime() + hours * 3_600_000 + minutes * 60_000;
    // Use the offset at the approximate target moment for DST correctness.
    const offsetAtTarget = getOffset(new Date(localMs));
    return new Date(localMs - offsetAtTarget * 60_000);
  }

  const time = extractTime(lower);
  const localDayOfWeek = localNow.getUTCDay();

  const hasTomorrow = lower.includes("tomorrow") || lower.includes("mañana");
  const hasToday = lower.includes("today") || lower.includes("hoy");
  const hasDayName = WEEK_DAYS.some(([, names]) => names.some((n) => lower.includes(n)));
  const hasWeekRef = lower.includes("next week") || lower.includes("this week") ||
    lower.includes("próxima semana") || lower.includes("proxima semana") ||
    lower.includes("esta semana");
  // Checked early: "May 23 at 3pm" must NOT fall into the bare-time→today branch.
  const md = extractMonthDay(lower);

  if (hasToday || (time && !md && !hasTomorrow && !hasDayName && !hasWeekRef &&
      !lower.includes("yesterday") && !lower.includes("ayer"))) {
    return applyTime(localTodayMidnight, time ?? { hours: 9, minutes: 0 });
  }
  if (hasTomorrow) {
    return applyTime(new Date(localTodayMidnight.getTime() + 86_400_000), time);
  }
  if (lower.includes("next week") || lower.includes("próxima semana") || lower.includes("proxima semana") || lower.includes("la próxima semana")) {
    return applyTime(new Date(localTodayMidnight.getTime() + 7 * 86_400_000), time);
  }
  if (lower.includes("this week") || lower.includes("esta semana")) {
    return applyTime(new Date(localTodayMidnight.getTime() + 3 * 86_400_000), time);
  }

  // Explicit "<month> <day>" beats a day name when both are present.
  // Example: "Friday May 23" — user wrote both, but the calendar date is unambiguous.
  // Pick the next occurrence of that month/day at or after today.
  if (md) {
    let year = localNow.getUTCFullYear();
    const localTodayMs = localTodayMidnight.getTime();
    const candidate = new Date(Date.UTC(year, md.month, md.day));
    if (candidate.getTime() < localTodayMs) {
      year += 1;
    }
    const target = new Date(Date.UTC(year, md.month, md.day));
    return applyTime(target, time);
  }

  for (const [dayNum, names] of WEEK_DAYS) {
    if (names.some((n) => lower.includes(n))) {
      const daysUntil = (dayNum + 7 - localDayOfWeek) % 7 || 7;
      return applyTime(new Date(localTodayMidnight.getTime() + daysUntil * 86_400_000), time);
    }
  }

  const iso = new Date(due);
  if (!isNaN(iso.getTime())) return applyTime(iso, time);

  return null;
}

// ── Ideas ─────────────────────────────────────────────────────────────────────

const IDEA_SYSTEM = `You are an expert note-taker and strategist. Take a raw brain dump and structure it into a clear, readable note.

━━ RULES ━━
- Preserve the original language. Spanish → Spanish. English → English. Never translate.
- Extract a punchy title (5-8 words max).
  - If the idea involves a specific person, client, or project, include that in the title.
  - Examples: "Growth plan for Emilio", "Podcast strategy — JustDilo", "App monetization ideas"
- Write a 1-2 sentence summary (TL;DR).
  - Always capture WHO this is for/about if mentioned (e.g. "Strategy for growing Emilio's account to 1K followers").
  - Always capture the GOAL or OUTCOME if mentioned.
- Organize content into logical sections with short headings and bullet points.
- Extract key_insights: the most important/surprising/actionable points (max 4).
- Extract action_items: concrete things the person should do (max 6). Be specific — include names, numbers, platforms.
- Assign 2-4 short lowercase tags.
- NEVER add information not present in the input — only organize and clarify.
- If the input is very short (<20 words), skip sections[] and just return title, summary, key_insights.

━━ RESPONSE FORMAT ━━
Return ONLY valid JSON:
{
  "title": "Short punchy title",
  "summary": "1-2 sentence TL;DR",
  "sections": [
    { "heading": "Section name", "points": ["point 1", "point 2"] }
  ],
  "key_insights": ["Most important insight"],
  "action_items": ["Do this specific thing"],
  "tags": ["business", "product"]
}`;

const IdeaSchema = z.object({
  title: z.string().default("Untitled Idea"),
  summary: z.string().default(""),
  sections: z.array(z.object({
    heading: z.string(),
    points: z.array(z.string()),
  })).default([]),
  key_insights: z.array(z.string()).default([]),
  action_items: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
export type IdeaStructure = z.infer<typeof IdeaSchema>;

const IDEA_APPEND_SYSTEM = `You are an expert note-taker. You have an existing structured idea and new raw content to merge in.

━━ RULES ━━
- Preserve the original language. Spanish → Spanish. English → English. Never translate.
- Keep ALL existing content — never delete or shorten existing sections, insights, or action items.
- Integrate the new content intelligently:
  - Add new bullet points to existing sections if they fit thematically.
  - Create new sections if the new content covers a distinct topic.
  - Add new key_insights and action_items from the new content.
  - Update the summary only if the new content meaningfully expands the scope.
  - Keep the title unless the new content dramatically changes the core topic.
- Deduplicate: if new content repeats existing points, skip the duplicates.
- Return the complete updated idea — all original content plus the new additions.

━━ RESPONSE FORMAT ━━
Return ONLY valid JSON:
{
  "title": "...",
  "summary": "...",
  "sections": [{ "heading": "...", "points": ["..."] }],
  "key_insights": ["..."],
  "action_items": ["..."],
  "tags": ["..."]
}`;

export async function appendToIdea(existing: IdeaStructure, newText: string): Promise<IdeaStructure> {
  const userContent = `EXISTING IDEA:\n${JSON.stringify(existing, null, 2)}\n\nNEW CONTENT TO ADD:\n${newText}`;
  const messages = [
    { role: "system" as const, content: IDEA_APPEND_SYSTEM },
    { role: "user" as const, content: userContent },
  ];

  let raw = "{}";
  try {
    if (provider === "groq" && groq) {
      raw = await callGroq(messages);
    } else if (openai) {
      raw = await callOpenAI(messages);
    } else {
      throw new Error("No AI provider configured");
    }
  } catch (primaryErr) {
    try {
      if (provider === "groq" && openai) raw = await callOpenAI(messages);
      else if (groq) raw = await callGroq(messages);
      else throw primaryErr;
    } catch {
      throw primaryErr;
    }
  }

  console.log("[ai] appendToIdea raw length:", raw.length);
  const parsed = IdeaSchema.safeParse(safeParseJSON(raw));
  if (!parsed.success) {
    console.error("[ai] appendToIdea validation failed:", parsed.error.issues);
    return existing;
  }
  return parsed.data;
}

export async function structureIdea(text: string): Promise<IdeaStructure> {
  const messages = [
    { role: "system" as const, content: IDEA_SYSTEM },
    { role: "user" as const, content: text },
  ];

  let raw = "{}";
  try {
    if (provider === "groq" && groq) {
      raw = await callGroq(messages);
    } else if (openai) {
      raw = await callOpenAI(messages);
    } else {
      throw new Error("No AI provider configured");
    }
  } catch (primaryErr) {
    try {
      if (provider === "groq" && openai) raw = await callOpenAI(messages);
      else if (groq) raw = await callGroq(messages);
      else throw primaryErr;
    } catch {
      throw primaryErr;
    }
  }

  console.log("[ai] structureIdea raw length:", raw.length);
  const parsed = IdeaSchema.safeParse(safeParseJSON(raw));
  if (!parsed.success) {
    console.error("[ai] structureIdea validation failed:", parsed.error.issues);
    return { title: "Idea", summary: text.slice(0, 120), sections: [], key_insights: [], action_items: [], tags: [] };
  }
  return parsed.data;
}
