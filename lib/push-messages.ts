import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export function detectSpanish(texts: string[]): boolean {
  return texts.some((t) =>
    /[¿¡áéíóúñüÁÉÍÓÚÑ]|\b(el|la|los|las|que|de|en|es|por|para|con|hoy|mañana|tareas|urgente)\b/i.test(t),
  );
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

export async function morningBrief(tasks: { title: string; priority: string | null }[], name?: string | null): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish(tasks.map((t) => t.title));
  const high = tasks.filter((t) => t.priority === "high");
  const top = high[0] ?? tasks[0];
  const count = tasks.length;
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally, like a real friend would.` : "";

  if (count === 0) {
    return spanish
      ? { title: "día libre ☀️", body: name ? `${name}, nada en el plato hoy. úsalo bien.` : "nada en el plato hoy. úsalo bien." }
      : { title: "free day ☀️", body: name ? `${name}, nothing on the plate today. make it count.` : "nothing on the plate today. make it count." };
  }

  return aiMessage(
    `You are Dilo — you text your friend every morning like a close buddy who actually cares.
NOT an app. NOT a productivity tool. A real friend sending a WhatsApp message.
Return JSON: "title" (max 30 chars, lowercase preferred, one emoji ok) and "body" (max 90 chars, one sentence, conversational).
${spanish ? "Write in Spanish. Casual, like texting a close Latin friend. Spanglish is fine if natural." : "Write in casual English. Like texting a good friend, not writing a notification."}
${nameHint}
Rules:
- NEVER say "You have X tasks" — that's robot talk
- NEVER use bullet points or lists
- Mention the most important task by name naturally in the sentence
- Sound like a real person who cares, not an algorithm
- Short, punchy, like a text message
- Vary the structure — don't always start the same way`,
    `${count} thing${count > 1 ? "s" : ""} today. Most important: "${top.title}".`,
    spanish
      ? { title: "buenos días ☀️", body: `${name ? `${name}, ` : ""}hoy toca "${top.title}". dale.` }
      : { title: "good morning ☀️", body: `${name ? `${name}, ` : ""}"${top.title}" is waiting for you today.` },
  );
}

export async function eveningLetter(
  completedCount: number,
  openTasks: { title: string; priority: string | null }[],
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish(openTasks.map((t) => t.title));
  const topOpen = openTasks[0];
  const allDone = openTasks.length === 0;
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally, like a real friend would.` : "";

  if (allDone && completedCount === 0) {
    return spanish
      ? { title: "hey 🌙", body: name ? `${name}, hoy fue tranquilo. mañana empieza de cero.` : "hoy fue tranquilo. mañana empieza de cero." }
      : { title: "hey 🌙", body: name ? `${name}, quiet day. fresh start tomorrow.` : "quiet day. fresh start tomorrow." };
  }

  return aiMessage(
    `You are Dilo — texting your friend at night like a close buddy checking in after a long day.
NOT an app summary. A real friend who wants to know how the day went.
Return JSON: "title" (max 30 chars, lowercase, one calm emoji) and "body" (max 100 chars, one sentence).
${spanish ? "Spanish, casual. Spanglish is fine." : "Casual English."}
${nameHint}
Rules:
- If they got stuff done: celebrate it genuinely, briefly. Don't be cheesy.
- If nothing got done: zero guilt. Just warmth. "mañana es otro día" energy.
- If there's something still open: mention it lightly, like "oye, lo de X sigue ahí para mañana"
- One natural sentence. No lists. No summaries. No "Here's what you did today."
- Sound like a human who genuinely cares`,
    `Completed today: ${completedCount}.${topOpen ? ` Still open: "${topOpen.title}".` : " Everything done!"}`,
    spanish
      ? {
          title: "buenas noches 🌙",
          body: completedCount > 0
            ? `${name ? `${name}, ` : ""}cerraste ${completedCount} cosa${completedCount > 1 ? "s" : ""} hoy.${topOpen ? ` Lo de "${topOpen.title}" sigue pa' mañana.` : " todo listo."}`
            : `${name ? `${name}, ` : ""}descansa. mañana${topOpen ? ` lo de "${topOpen.title}"` : ""} tiene solución.`,
        }
      : {
          title: "good night 🌙",
          body: completedCount > 0
            ? `${name ? `${name}, ` : ""}you got ${completedCount} thing${completedCount > 1 ? "s" : ""} done today.${topOpen ? ` "${topOpen.title}" carries to tomorrow.` : " all clear."}`
            : `${name ? `${name}, ` : ""}rest up. tomorrow${topOpen ? ` "${topOpen.title}"` : ""} is waiting.`,
        },
  );
}

export async function stuckNudge(
  taskTitle: string,
  daysOverdue: number,
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish([taskTitle]);
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally, like a real friend would.` : "";

  return aiMessage(
    `You are Dilo — a close friend gently calling out something they've been putting off.
NOT a reminder app. A real friend who's curious, not judgy.
Return JSON: "title" (max 28 chars) and "body" (max 90 chars).
${spanish ? "Spanish, casual. Like texting a close friend." : "Casual English."}
${nameHint}
Rules:
- Tone: "oye, qué pasó con X?" — curious, warm, zero guilt
- Mention the task by name naturally
- Give two options in the most natural way: just do it (5 min) OR let it go for real
- NEVER say "This task is overdue" — that's robot talk
- One sentence. Real talk.`,
    `Task: "${taskTitle}". Been waiting ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}.`,
    spanish
      ? { title: "oye... 👀", body: `${name ? `${name}, ` : ""}qué pasó con "${taskTitle}"? dale 5 minutos o suéltala de una.` }
      : { title: "hey... 👀", body: `${name ? `${name}, ` : ""}what happened with "${taskTitle}"? 5 min or let it go.` },
  );
}
