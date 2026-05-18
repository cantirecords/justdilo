import Groq from "groq-sdk";
import OpenAI from "openai";
import { z } from "zod";

const provider = process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "openai");
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Long-form transcription. Groq's whisper-large-v3 handles up to ~25MB files;
// at 24kbps opus that's ~140 minutes, which covers any normal meeting.
export async function transcribeMeeting(file: File): Promise<{ text: string; provider: string; ms: number }> {
  const t0 = Date.now();
  if (provider === "groq" && groq) {
    const r = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      response_format: "text",
      prompt: "Multi-speaker business meeting. Capture every word including names, dates, deadlines, decisions, and action items. English, Spanish, or Spanglish.",
    } as any);
    return { text: typeof r === "string" ? r : (r as any).text ?? "", provider: "groq", ms: Date.now() - t0 };
  }
  if (!openai) throw new Error("No AI provider configured");
  const r = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    prompt: "Multi-speaker business meeting. Capture every word including names, dates, deadlines, decisions, and action items.",
  });
  return { text: r.text, provider: "openai", ms: Date.now() - t0 };
}

export const ActionItemSchema = z.object({
  title: z.string(),
  note: z.string().nullable().optional().default(null),
  assignee_name: z.string().nullable().optional().default(null),
  due: z.string().nullable().optional().default(null),
  priority: z.enum(["low", "med", "high"]).nullable().optional().default(null),
});

export const MeetingSummarySchema = z.object({
  title: z.string().default("Meeting"),
  summary: z.string().default(""),
  language: z.enum(["en", "es", "other"]).default("en"),
  decisions: z.array(z.string()).default([]),
  action_items: z.array(ActionItemSchema).default([]),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

const MEETING_SYSTEM = `You are an expert meeting note-taker for a team task manager.
You read raw meeting transcripts (often unstructured, multi-speaker, possibly mixed language) and produce a clean structured summary plus a list of action items, each assigned to the right person when the transcript makes it clear.

━━ LANGUAGE RULE ━━
Detect the dominant language of the transcript. Output the title, summary, decisions, and action item titles in THAT language. Never translate.
- Spanish meeting → Spanish output. English → English. Mixed → use the dominant one.

━━ TITLE ━━
5–10 words. Capture the actual topic, not a generic "Team Meeting".
Examples: "Q3 product roadmap review", "Marketing launch planning", "Reunión semanal de ventas".

━━ SUMMARY ━━
2–4 sentences. Cover what was discussed and what was decided. Concrete, not generic.

━━ DECISIONS ━━
Each entry: one concrete decision the group made (1 sentence). Skip if nothing was decided.
Example: "Move launch from June 15 to July 1 to give QA more time."

━━ ACTION ITEMS — MOST IMPORTANT ━━
An action item = a concrete thing a specific person committed to doing.
- Title: 4–10 words, verb-first, self-contained context (will be sent as a notification on its own).
  GOOD: "Send revised proposal to Acme", "Book venue for offsite"
  BAD: "Follow up", "Send it"
- assignee_name: ONLY set if a TEAM MEMBER from the provided roster was clearly assigned. Use the EXACT roster name. If unclear or general ("we should…"), leave null.
- due: relative phrase like "tomorrow", "next Friday", "by end of week", "in two weeks", or null if not stated.
- note: 1 short sentence of context if the title alone is ambiguous, else null.
- priority: "high" only if the meeting explicitly framed it as urgent/critical/blocker. Else null.

Do NOT invent action items the meeting didn't produce. If nobody committed to anything, return an empty array.
Do NOT duplicate decisions as action items.

━━ RESPONSE FORMAT ━━
Return ONLY valid JSON, no markdown:
{
  "title": "...",
  "summary": "...",
  "language": "en" | "es" | "other",
  "decisions": ["..."],
  "action_items": [
    { "title": "...", "note": "...|null", "assignee_name": "Alice|null", "due": "next Friday|null", "priority": "high|null" }
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
    temperature: 0.2,
  });
  return r.choices[0]?.message?.content ?? "{}";
}

async function callOpenAI(messages: { role: "system" | "user"; content: string }[]): Promise<string> {
  if (!openai) throw new Error("OpenAI not configured");
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  return r.choices[0]?.message?.content ?? "{}";
}

export async function summarizeMeeting(
  transcript: string,
  teamMembers: string[] = [],
): Promise<MeetingSummary & { _provider: string; _ms: number }> {
  const userContent = teamMembers.length > 0
    ? `TEAM ROSTER (only assign action items to these names): ${teamMembers.join(", ")}\n\nTRANSCRIPT:\n${transcript}`
    : `TRANSCRIPT (solo or untracked roster — leave assignee_name null):\n${transcript}`;

  const messages = [
    { role: "system" as const, content: MEETING_SYSTEM },
    { role: "user" as const, content: userContent },
  ];

  const t0 = Date.now();
  let raw = "{}";
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
    } catch {
      throw primaryErr;
    }
  }

  const _ms = Date.now() - t0;
  const parsed = MeetingSummarySchema.safeParse(safeParseJSON(raw));
  if (!parsed.success) {
    console.error("[meetings] summary validation failed:", parsed.error.issues, "raw:", raw.slice(0, 400));
    return {
      title: "Meeting",
      summary: transcript.slice(0, 200),
      language: "en",
      decisions: [],
      action_items: [],
      _provider: usedProvider,
      _ms,
    };
  }
  return { ...parsed.data, _provider: usedProvider, _ms };
}
