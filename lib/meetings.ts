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

// Sections are a free-form map: { section_key: ["point 1", "point 2", ...] }
// The keys are dictated by the active template (e.g. decisions, blockers, ideas).
// action_items live alongside sections because they always create real tasks.
export const MeetingSummarySchema = z.object({
  title: z.string().default("Meeting"),
  summary: z.string().default(""),
  language: z.enum(["en", "es", "other"]).default("en"),
  action_items: z.array(ActionItemSchema).default([]),
  sections: z.record(z.string(), z.array(z.string())).default({}),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

export type TemplateSectionInput = { key: string; label: string; description?: string };
export type TemplateInput = { name: string; description?: string | null; sections: TemplateSectionInput[] };

const DEFAULT_TEMPLATE: TemplateInput = {
  name: "General",
  description: "Default — fits any meeting",
  sections: [
    { key: "decisions", label: "Decisions", description: "Concrete decisions the group made" },
    { key: "action_items", label: "Action items", description: "Tasks assigned to specific people" },
  ],
};

function buildSystemPrompt(template: TemplateInput): string {
  // action_items is always extracted (it drives task creation), regardless of
  // whether the template lists it explicitly. key_points is always extracted
  // too — it's the "everything worth remembering" list every meeting needs.
  const nonActionSections = template.sections.filter(
    (s) => s.key !== "action_items" && s.key !== "key_points",
  );

  const sectionLines = nonActionSections.length
    ? nonActionSections.map((s) => `  - "${s.key}" (${s.label}): ${s.description ?? "Relevant points from the transcript"}`).join("\n")
    : "  (no extra template sections — focus on key_points, summary, and action items)";

  const sampleSections = nonActionSections.length
    ? `{\n    "key_points": ["...", "...", "..."],\n${nonActionSections.map((s) => `    "${s.key}": ["..."]`).join(",\n")}\n  }`
    : `{\n    "key_points": ["...", "...", "..."]\n  }`;

  return `You are an expert meeting note-taker. Teams trust your notes to replace hand-written ones. People who missed the meeting should be able to read your output and fully understand what happened, what was decided, and what's next. Thin output is a failure — it is your most important job to capture everything that matters.

━━ MEETING TYPE ━━
Template: "${template.name}"${template.description ? ` — ${template.description}` : ""}

━━ MATCH THE DEPTH TO THE LENGTH ━━
- 5 min: a tight paragraph and a handful of bullets.
- 30 min: 2–3 paragraphs and ~10 bullets.
- 60 min: 3–4 paragraphs and 15–25 bullets.
- 90+ min: 4–6 paragraphs and 25+ bullets.
NEVER compress a long meeting into one or two sentences. That is the #1 failure mode and will get this output rejected.

━━ LANGUAGE RULE ━━
Detect the dominant language. Output the title, summary, sections, and action items in THAT language. Never translate.

━━ TITLE ━━
6–10 words. Capture the actual subject, not a generic "Team Meeting".

━━ SUMMARY (multi-paragraph for any meeting longer than 10 minutes) ━━
A full executive recap, organized into paragraphs separated by blank lines:
  Paragraph 1 — What this meeting was about, who was there (if clear from context), and the headline outcome.
  Paragraph 2 — The main topics discussed in order, with enough specifics that someone who missed it understands the discussion.
  Paragraph 3 — Decisions reached, debates, disagreements, open threads.
  Paragraph 4+ — Anything else worth recording (context, plans, risks, ideas raised).
Concrete language. Name people, projects, numbers, dates as they appear in the transcript. Avoid generic phrases like "the team discussed various topics."

━━ KEY POINTS (always required — populate the "key_points" array) ━━
A comprehensive bullet list of EVERY meaningful thing discussed. Aim for one bullet per 2–4 minutes of meeting. Each bullet is a self-contained sentence (a future reader doesn't need the audio). Cover topics, opinions, debates, observations, context, background, anecdotes, plans, risks, ideas. This is the "if I read only the bullets I still know what happened" list.

━━ TEMPLATE SECTIONS — one list per key below ━━
${sectionLines}
Skip a section by returning an empty array for its key. Do NOT invent content the meeting didn't produce.

━━ ACTION ITEMS — concrete commitments ━━
An action item = a specific person committed to a specific thing.
- Title: 4–10 words, verb-first, self-contained.
  GOOD: "Send revised proposal to Acme", "Book venue for offsite"
  BAD: "Follow up", "Send it"
- assignee_name: ONLY if a TEAM ROSTER name was clearly assigned. Use exact roster name. Null if unclear or general ("we should...").
- due: relative phrase ("tomorrow", "next Friday", "in two weeks") or null.
- note: 1 sentence of context if the title alone is ambiguous, else null.
- priority: "high" only if explicitly urgent/blocker. Else null.
Do NOT invent action items. Do NOT duplicate key_points as action items.

━━ RESPONSE FORMAT ━━
Return ONLY valid JSON, no markdown. Use EXACTLY these keys:
{
  "title": "...",
  "summary": "Paragraph 1.\\n\\nParagraph 2.\\n\\nParagraph 3.",
  "language": "en" | "es" | "other",
  "sections": ${sampleSections},
  "action_items": [
    { "title": "...", "note": "...|null", "assignee_name": "Alice|null", "due": "next Friday|null", "priority": "high|null" }
  ]
}`;
}

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
    max_tokens: 8192,
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
    max_tokens: 8192,
  });
  return r.choices[0]?.message?.content ?? "{}";
}

export async function summarizeMeeting(
  transcript: string,
  teamMembers: string[] = [],
  template: TemplateInput = DEFAULT_TEMPLATE,
): Promise<MeetingSummary & { _provider: string; _ms: number }> {
  const userContent = teamMembers.length > 0
    ? `TEAM ROSTER (only assign action items to these names): ${teamMembers.join(", ")}\n\nTRANSCRIPT:\n${transcript}`
    : `TRANSCRIPT (solo or untracked roster — leave assignee_name null):\n${transcript}`;

  const messages = [
    { role: "system" as const, content: buildSystemPrompt(template) },
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
      action_items: [],
      sections: {},
      _provider: usedProvider,
      _ms,
    };
  }
  return { ...parsed.data, _provider: usedProvider, _ms };
}
