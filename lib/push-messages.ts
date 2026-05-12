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

// ── Mood system ───────────────────────────────────────────────────────────────

type MoodState = "crushing_it" | "normal" | "slipping" | "stuck" | "overwhelmed";

function computeMorningMood(params: {
  overdueCount: number;
  maxOverdueDays: number;
  urgentOverdueCount: number;
  todayCount: number;
  totalOpen: number;
}): MoodState {
  const { overdueCount, maxOverdueDays, urgentOverdueCount, todayCount, totalOpen } = params;
  if (overdueCount >= 5 || (overdueCount >= 3 && maxOverdueDays >= 5) || urgentOverdueCount >= 2) return "stuck";
  if (totalOpen >= 12 || todayCount >= 8) return "overwhelmed";
  if (overdueCount >= 3 || maxOverdueDays >= 4) return "slipping";
  if (overdueCount === 0 && totalOpen > 0 && totalOpen <= todayCount + 2) return "crushing_it";
  return "normal";
}

const MOOD_TONE: Record<MoodState, Record<Lang, string>> = {
  crushing_it: {
    spanish:   "TONO: EUFÓRICO. Están en racha sin nada atrasado. Suéltate, celebra en serio, como cuando mete un gol. Sé suelto, bromea, juega.",
    spanglish: "TONO: ON FIRE. They're crushing it, zero overdue. Go big, celebrate loud. Be loose, even play around.",
    english:   "TONO: HYPED. They're on a streak, nothing overdue. Go big, be loud about it. Loose, maybe even playful.",
  },
  normal: {
    spanish:   "TONO: Chill y cálido. Un día normal, amigo que da ánimos sin exagerar. Real, humano.",
    spanglish: "TONO: Chill and warm. Normal day — real friend giving them a boost, not overdoing it.",
    english:   "TONO: Chill and warm. Normal day — real friend giving a genuine boost, not overdoing it.",
  },
  slipping: {
    spanish:   "TONO: PREOCUPADO pero con cariño. Nótalo, dilo directo sin drama. 'oye, llevas unos días con esto atrasado, hoy hay que atacarlo.' No juzgas, pero tampoco les mientes. Como el amigo que te dice la verdad.",
    spanglish: "TONO: CONCERNED but caring. Call it out. 'oye, you've been slipping a bit — hoy es el día.' No judgment but no lies. The friend who tells you the truth.",
    english:   "TONO: CONCERNED but caring. Call it out directly. 'hey, you've been slipping a bit — today is the day.' No judgment but zero sugarcoating.",
  },
  stuck: {
    spanish:   "TONO: SERIO. Ya estuvo. Sin rodeos, como cuando tu mejor amigo te dice la verdad aunque duela. 'no te puedo mentir, esto está muy atrasado y HOY hay que atacarlo.' Firme, no enojado, pero CERO excusas. Nada de 'no worries'. Directo.",
    spanglish: "TONO: SERIOUS. No more messing around. Best friend telling you the hard truth. 'no te puedo mentir, this has been sitting way too long. HOY es el día, no hay pretexto.' Firm, not angry, but absolutely zero excuses.",
    english:   "TONO: SERIOUS. Best friend telling you the hard truth. 'I won't lie to you — this has been sitting too long. TODAY is the day, no excuses.' Firm, direct, from a place of love but zero sugarcoating.",
  },
  overwhelmed: {
    spanish:   "TONO: CALMANTE. Tienen demasiado. Tu trabajo es bajarles la ansiedad y enfocarlos en UNA sola cosa. 'respira, hoy solo necesitas hacer X, el resto puede esperar.' Suave pero claro. No más.",
    spanglish: "TONO: CALMING. Way too much on their plate. Your job is to kill the anxiety and focus them on ONE thing. 'respira, hoy solo necesitas X, el resto can wait.' Soft but laser focused.",
    english:   "TONO: CALMING. Way too much on their plate. Kill the anxiety, focus them on ONE thing. 'breathe — today you just need to do X, everything else can wait.' Soft but laser focused.",
  },
};

export type OverdueContext = {
  count: number;
  maxDays: number;
  urgentCount: number;
  topTitle: string | null;
};

export async function morningBrief(
  todayTasks: { title: string; priority: string | null }[],
  overdue: OverdueContext,
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const allTitles = [...todayTasks.map((t) => t.title), ...(overdue.topTitle ? [overdue.topTitle] : [])];
  const lang = detectLanguage(allTitles);
  const high = todayTasks.filter((t) => t.priority === "high");
  const top = high[0] ?? todayTasks[0];
  const todayCount = todayTasks.length;
  const totalOpen = todayCount + overdue.count;

  const mood = computeMorningMood({
    overdueCount: overdue.count,
    maxOverdueDays: overdue.maxDays,
    urgentOverdueCount: overdue.urgentCount,
    todayCount,
    totalOpen,
  });

  const nameHint = name ? `El nombre del usuario es ${name}. Úsalo UNA vez, natural, no al inicio.` : "";

  // Nothing anywhere → free day
  if (totalOpen === 0) {
    const n = name ? `${name}, ` : "";
    if (lang === "spanish")   return { title: "día libre ☀️", body: `${n}nada en el plato hoy. aprovéchalo.` };
    if (lang === "spanglish") return { title: "free day ☀️",  body: `${n}nada en el plato hoy. make it count.` };
    return { title: "free day ☀️", body: `${n}nothing on the plate today. make it count.` };
  }

  const titleFallback = {
    crushing_it: lang !== "english" ? "🔥 en racha" : "🔥 on a streak",
    normal:      lang !== "english" ? "buenos días ☀️" : "good morning ☀️",
    slipping:    lang !== "english" ? "oye... 👀" : "hey... 👀",
    stuck:       lang !== "english" ? "necesitamos hablar 👀" : "real talk 👀",
    overwhelmed: lang !== "english" ? "respira 🫁" : "breathe 🫁",
  }[mood];

  const bodyFallback = lang === "english"
    ? `${name ? `${name}, ` : ""}${top?.title ?? overdue.topTitle} — let's get it done today.`
    : `${name ? `${name}, ` : ""}dale, "${top?.title ?? overdue.topTitle}" no se va a hacer solo.`;

  // Build the situational context for the AI
  const contextParts: string[] = [];
  if (todayCount > 0) contextParts.push(`${todayCount} task${todayCount > 1 ? "s" : ""} due today`);
  if (overdue.count > 0) contextParts.push(`${overdue.count} OVERDUE (oldest: ${overdue.maxDays} day${overdue.maxDays > 1 ? "s" : ""})`);
  if (overdue.urgentCount > 0) contextParts.push(`${overdue.urgentCount} urgent overdue`);
  if (top) contextParts.push(`top task today: "${top.title}"`);
  if (!top && overdue.topTitle) contextParts.push(`worst overdue task: "${overdue.topTitle}"`);

  return aiMessage(
    `Eres Dilo — el amigo más cercano del usuario. Lo conoces de años. Le mandas un mensaje todas las mañanas. NO eres una app, NO eres corporativo, NO andas con rodeos.
Regresa JSON: "title" (máx 30 chars, lowercase, 1 emoji OK) y "body" (máx 100 chars, UNA oración).
${MOOD_TONE[mood][lang]}
${nameHint}
Reglas ABSOLUTAS:
- NUNCA digas "You have X tasks" o "Tienes X tareas". Nunca listes.
- Sin bullet points. Una oración con punch.
- Menciona la tarea top por nombre.
- Varía el estructura cada vez — nunca empieces igual.
- Suenas como persona real, no como notificación.
- Tono va con el mood: ${mood}. No lo suavices ni lo endulces más de lo que dice el tono.`,
    contextParts.join(". "),
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
TITLE RULE — critical: The title must be a short version of the TASK NAME, never a number or duration. Think: subject line of a text message about that specific thing.
  ✓ Good: "Splice credits 👀" / "esa llamada... 👀" / "el menú de Emilio 👀"
  ✗ Bad: "3 days" / "hey... 👀" / "reminder" / any number
Rules: Mention task by name in the body. Offer two exits: do it (5 min) OR let it go. NEVER say "overdue". Make them smile, not feel bad.`,
    `Task: "${taskTitle}". Waiting ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}.`,
    fallback,
  );
}
