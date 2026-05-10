import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export type Lang = "spanish" | "english" | "spanglish";

export function detectLanguage(texts: string[]): Lang {
  const joined = texts.join(" ");
  const hasSpanish = /[¿¡áéíóúñüÁÉÍÓÚÑ]|\b(el|la|los|las|que|de|en|es|por|para|con|hoy|mañana|tareas|urgente|hacer|reunión|llamar|enviar|pagar|comprar)\b/i.test(joined);
  const hasEnglish = /\b(the|and|with|for|this|that|have|my|your|task|today|tomorrow|email|meeting|call|work|send|buy|fix|check|review|update|write|finish)\b/i.test(joined);
  if (hasSpanish && hasEnglish) return "spanglish";
  if (hasSpanish) return "spanish";
  return "english";
}

// legacy shim for callers that still use detectSpanish
export function detectSpanish(texts: string[]): boolean {
  return detectLanguage(texts) !== "english";
}

async function aiMessage(
  system: string,
  user: string,
  fallback: { title: string; body: string },
): Promise<{ title: string; body: string }> {
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.95,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    if (parsed.title && parsed.body) return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

function langInstruction(lang: Lang, type: "morning" | "evening" | "stuck"): string {
  const examples = {
    morning: {
      spanish: `Write 100% in Spanish. Casual, street-level, like texting a close Latin friend.
Examples: "ponte las pilas, hoy no hay pretextos" / "échale ganas, empieza por X" / "ya mero, tú puedes"`,
      spanglish: `Write in Spanglish — mix Spanish and English naturally, like a bilingual friend texting.
Examples: "let's go, hoy tienes que atacar X" / "dale, no te me rajes con lo de X" / "you got this, empieza con X"`,
      english: `Write in casual English. Like texting a good friend who believes in you.
Examples: "don't sleep on this one" / "you've got this, start with X" / "let's go, today's the day for X"`,
    },
    evening: {
      spanish: `Write 100% in Spanish. Warm, close friend energy at the end of the day.
Examples: "qué máquina, lo rompiste hoy 🔥" / "oye, hoy no fue tu día y eso está bien, mañana lo recuperas"`,
      spanglish: `Write in Spanglish — warm, bilingual close friend energy.
Examples: "you crushed it hoy 🔥" / "oye, not your day today — mañana lo atacas" / "solid day, lo de X sigue pa' mañana"`,
      english: `Write in casual English. Warm close friend checking in.
Examples: "you destroyed it today, seriously" / "not every day lands — tomorrow you bounce back"`,
    },
    stuck: {
      spanish: `Write 100% in Spanish. Curious friend energy, not judgmental.
Examples: "oye, qué pasó con X? dale 5 min o suéltala de una" / "ya llevas días con X, hoy o nunca"`,
      spanglish: `Write in Spanglish. Warm and direct.
Examples: "oye, what happened with X? dale 5 min or let it go" / "X has been sitting there — hoy o nunca"`,
      english: `Write in casual English. Warm but direct.
Examples: "what happened with X? 5 minutes or drop it for good" / "X has been sitting there — today or let it go"`,
    },
  };
  return examples[type][lang];
}

export async function morningBrief(
  tasks: { title: string; priority: string | null }[],
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const lang = detectLanguage(tasks.map((t) => t.title));
  const high = tasks.filter((t) => t.priority === "high");
  const top = high[0] ?? tasks[0];
  const count = tasks.length;
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally.` : "";
  const manyTasks = count >= 4;
  const hasHighPriority = high.length > 0;

  if (count === 0) {
    const n = name ? `${name}, ` : "";
    if (lang === "spanish")   return { title: "día libre ☀️", body: `${n}nada en el plato hoy. aprovéchalo.` };
    if (lang === "spanglish") return { title: "free day ☀️",  body: `${n}nada en el plato hoy. make it count.` };
    return { title: "free day ☀️", body: `${n}nothing on the plate today. make it count.` };
  }

  const titleFallback = lang === "english" ? "good morning ☀️" : "buenos días ☀️";
  const bodyFallback = lang === "english"
    ? `${name ? `${name}, ` : ""}let's go — "${top?.title}" is waiting.`
    : lang === "spanish"
    ? `${name ? `${name}, ` : ""}ponte las pilas, empieza con "${top?.title}".`
    : `${name ? `${name}, ` : ""}dale, hoy empieza con "${top?.title}".`;

  return aiMessage(
    `You are Dilo — texting your friend every morning like a real close friend who cares about them winning the day. NOT an app.
Return JSON: "title" (max 30 chars, lowercase, 1 emoji ok) and "body" (max 95 chars, ONE sentence).
${langInstruction(lang, "morning")}
${nameHint}
Context: ${hasHighPriority ? "HIGH priority task — add urgency, not stress" : "normal day"}.${manyTasks ? " Lots on their plate — encouraging, not overwhelming." : ""}
Rules: NEVER say "You have X tasks". No bullet points. Mention the top task by name. Make them WANT to start. Vary structure every time.`,
    `${count} task${count > 1 ? "s" : ""} today. Most important: "${top?.title}". High priority: ${hasHighPriority}. Many: ${manyTasks}.`,
    { title: titleFallback, body: bodyFallback },
  );
}

export async function eveningLetter(
  completedCount: number,
  openTasks: { title: string; priority: string | null }[],
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const lang = detectLanguage(openTasks.map((t) => t.title));
  const topOpen = openTasks[0];
  const allDone = openTasks.length === 0;
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally.` : "";
  const crushedIt = completedCount >= 3;
  const nothingDone = completedCount === 0 && openTasks.length > 0;

  if (allDone && completedCount === 0) {
    const n = name ? `${name}, ` : "";
    if (lang === "spanish")   return { title: "hey 🌙", body: `${n}hoy fue tranquilo. mañana empieza de cero.` };
    if (lang === "spanglish") return { title: "hey 🌙", body: `${n}quiet day. mañana fresh start.` };
    return { title: "hey 🌙", body: `${n}quiet day. fresh start tomorrow.` };
  }

  const titleFallback = lang === "english" ? "good night 🌙" : "buenas noches 🌙";
  const bodyFallback = lang === "english"
    ? completedCount > 0
      ? `${name ? `${name}, ` : ""}you got ${completedCount} done${topOpen ? ` — "${topOpen.title}" carries to tomorrow.` : " — all clear 🔥"}`
      : `${name ? `${name}, ` : ""}not your day today — tomorrow you bounce back.`
    : completedCount > 0
      ? `${name ? `${name}, ` : ""}cerraste ${completedCount} hoy${topOpen ? `, lo de "${topOpen.title}" pa' mañana.` : " — todo listo 🔥"}`
      : `${name ? `${name}, ` : ""}hoy no fue tu día y eso está bien. mañana lo recuperas.`;

  return aiMessage(
    `You are Dilo — texting your friend at night like a close buddy checking in. NOT a summary app. A real friend who wants them to come back tomorrow.
Return JSON: "title" (max 30 chars, lowercase, 1 calm emoji) and "body" (max 100 chars, ONE sentence).
${langInstruction(lang, "evening")}
${nameHint}
Context: completed ${completedCount} task${completedCount !== 1 ? "s" : ""}.${crushedIt ? " CRUSHED IT — go big with the celebration." : ""}${nothingDone ? " Nothing done — pure warmth, zero guilt, make them excited for tomorrow." : ""}${topOpen ? ` Still open: "${topOpen.title}".` : " Everything done!"}
Rules: No lists. If something open, mention it lightly. Goal: they wake up WANTING to open the app. One sentence. Sound human.`,
    `Completed: ${completedCount}.${topOpen ? ` Still open: "${topOpen.title}".` : " All done!"}`,
    { title: titleFallback, body: bodyFallback },
  );
}

export async function stuckNudge(
  taskTitle: string,
  daysOverdue: number,
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const lang = detectLanguage([taskTitle]);
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally.` : "";
  const veryStuck = daysOverdue >= 5;

  const fallback = lang === "english"
    ? { title: "hey... 👀", body: `${name ? `${name}, ` : ""}what happened with "${taskTitle}"? 5 min or let it go.` }
    : lang === "spanish"
    ? { title: "oye... 👀", body: `${name ? `${name}, ` : ""}qué pasó con "${taskTitle}"? dale 5 min o suéltala.` }
    : { title: "oye... 👀", body: `${name ? `${name}, ` : ""}what happened with "${taskTitle}"? dale 5 min or let it go.` };

  return aiMessage(
    `You are Dilo — a close friend gently calling out something they keep putting off. Curious, warm, never judgmental.
Return JSON: "title" (max 28 chars) and "body" (max 90 chars, ONE sentence).
${langInstruction(lang, "stuck")}
${nameHint}
Context: task waiting ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}.${veryStuck ? " Been a while — slightly more direct, still warm." : ""}
Rules: Mention task by name. Offer two exits: do it (5 min) OR let it go. NEVER say "overdue". Make them smile, not feel bad.`,
    `Task: "${taskTitle}". Waiting ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}.`,
    fallback,
  );
}
