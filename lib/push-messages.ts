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

export async function morningBrief(
  tasks: { title: string; priority: string | null }[],
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish(tasks.map((t) => t.title));
  const high = tasks.filter((t) => t.priority === "high");
  const top = high[0] ?? tasks[0];
  const count = tasks.length;
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally — like you're texting them.` : "";
  const manyTasks = count >= 4;
  const hasHighPriority = high.length > 0;

  if (count === 0) {
    return spanish
      ? { title: "día libre ☀️", body: name ? `${name}, nada en el plato hoy. aprovéchalo.` : "nada en el plato hoy. aprovéchalo." }
      : { title: "free day ☀️", body: name ? `${name}, nothing on the plate today. make it count.` : "nothing on the plate today. make it count." };
  }

  return aiMessage(
    `You are Dilo — texting your friend every morning like a real close friend who genuinely cares about them winning the day. NOT an app. NOT a productivity tool.
Return JSON: "title" (max 30 chars, lowercase, 1 emoji ok) and "body" (max 95 chars, ONE sentence, conversational).

${spanish
  ? `Write in Spanish. Casual, street-level, like texting a close Latin friend. Spanglish is fine.
Example phrases (adapt, don't copy exactly):
- "ponte las pilas, hoy no hay pretextos"
- "ya mero, tú puedes con esto"
- "échale ganas, hoy es tu día"
- "no te me rajes ahora"
- "mira que tienes lo de X pendiente, dale"
- "hoy vas a dominar, empieza por X"`
  : `Write in casual English. Like texting a good friend who believes in you.
Example phrases (adapt, don't copy exactly):
- "don't sleep on this one"
- "you've got this, start with X and the rest is easy"
- "let's go, today's the day for X"
- "no excuses today, you've been putting X off"
- "you're on a streak, keep it going with X"`
}
${nameHint}
Context: ${hasHighPriority ? "there's a HIGH priority task — add urgency, not stress" : "normal day"}.${manyTasks ? " They have a lot on their plate — be encouraging, not overwhelming." : ""}
Rules:
- NEVER say "You have X tasks" — robot talk
- NEVER use bullet points or lists
- Mention the most important task by name naturally in the sentence
- The goal is to make them WANT to open the app and start
- Sound like a human who genuinely cares, not an algorithm
- Short, punchy, like a WhatsApp message
- Vary the structure every time — no two mornings sound the same`,
    `${count} thing${count > 1 ? "s" : ""} today. Most important: "${top?.title}". High priority: ${hasHighPriority}. Many tasks: ${manyTasks}.`,
    spanish
      ? { title: "buenos días ☀️", body: `${name ? `${name}, ` : ""}ponte las pilas, hoy empieza con "${top?.title}".` }
      : { title: "good morning ☀️", body: `${name ? `${name}, ` : ""}let's go — "${top?.title}" is waiting for you.` },
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
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally — like you're texting them.` : "";
  const crushedIt = completedCount >= 3;
  const nothingDone = completedCount === 0 && openTasks.length > 0;

  if (allDone && completedCount === 0) {
    return spanish
      ? { title: "hey 🌙", body: name ? `${name}, hoy fue tranquilo. mañana empieza de cero.` : "hoy fue tranquilo. mañana empieza de cero." }
      : { title: "hey 🌙", body: name ? `${name}, quiet day. fresh start tomorrow.` : "quiet day. fresh start tomorrow." };
  }

  return aiMessage(
    `You are Dilo — texting your friend at night like a close buddy checking in after their day. NOT a summary app. A real friend who WANTS them to come back tomorrow and keep winning.
Return JSON: "title" (max 30 chars, lowercase, 1 calm emoji) and "body" (max 100 chars, ONE sentence).

${spanish
  ? `Spanish, casual, warm. Spanglish is fine.
Example phrases (adapt, don't copy):
- If they crushed it: "qué máquina, lo rompiste hoy 🔥"
- If they did ok: "bien hecho, lo de X sigue mañana pero hoy avanzaste"
- If nothing done: "oye, hoy no fue tu día y eso está bien, mañana lo recuperas" — ZERO guilt, only warmth`
  : `Casual English, warm, human.
Example phrases (adapt, don't copy):
- If they crushed it: "you destroyed it today, seriously proud of you"
- If they did ok: "solid day, X will be there tomorrow — you made progress"
- If nothing done: "hey, not every day lands — tomorrow you bounce back" — ZERO guilt, only warmth`
}
${nameHint}
Context: completed ${completedCount} task${completedCount !== 1 ? "s" : ""}.${crushedIt ? " They CRUSHED IT today — go big with the celebration, make them feel amazing." : ""}${nothingDone ? " Nothing got done — pure warmth, zero guilt. Make them want to try again tomorrow." : ""}${topOpen ? ` Still open: "${topOpen.title}".` : " Everything done!"}
Rules:
- If they finished things: make them feel GENUINELY great about it (not cheesy)
- If nothing done: warmth only, no guilt, make them excited to try tomorrow
- If something's still open: mention it lightly — "lo de X sigue ahí, mañana lo atacas"
- The goal is they wake up WANTING to open the app again
- One natural sentence. No lists. Sound like a human who genuinely cares`,
    `Completed: ${completedCount}.${topOpen ? ` Still open: "${topOpen.title}".` : " All done!"}`,
    spanish
      ? {
          title: "buenas noches 🌙",
          body: completedCount > 0
            ? `${name ? `${name}, ` : ""}cerraste ${completedCount} hoy${topOpen ? `, lo de "${topOpen.title}" pa' mañana.` : ", todo listo 🔥"}`
            : `${name ? `${name}, ` : ""}hoy no fue tu día y eso está bien. mañana lo recuperas.`,
        }
      : {
          title: "good night 🌙",
          body: completedCount > 0
            ? `${name ? `${name}, ` : ""}you got ${completedCount} done today${topOpen ? ` — "${topOpen.title}" carries to tomorrow.` : " — all clear 🔥"}`
            : `${name ? `${name}, ` : ""}not your day today — tomorrow you bounce back.`,
        },
  );
}

export async function stuckNudge(
  taskTitle: string,
  daysOverdue: number,
  name?: string | null,
): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish([taskTitle]);
  const nameHint = name ? `The user's name is ${name}. Use it once, naturally.` : "";
  const veryStuck = daysOverdue >= 5;

  return aiMessage(
    `You are Dilo — a close friend gently calling out something they keep putting off. NOT a reminder app. Think of it as that friend who says "oye, qué pasó con eso?" with a smile, not a frown.
Return JSON: "title" (max 28 chars) and "body" (max 90 chars, ONE sentence).
${spanish
  ? `Spanish, casual. Like texting a close friend.
Example phrases (adapt, don't copy):
- "oye, qué pasó con X? dale 5 minutos o suéltala de una vez"
- "ya llevas días con X, hoy o nunca"
- "mira, X no se va sola — dale o bórrala"`
  : `Casual English. Warm but direct.
Example phrases (adapt, don't copy):
- "hey, what happened with X? 5 minutes or drop it for good"
- "X has been sitting there — today's the day or let it go"
- "you've been dodging X, just do it or delete it"`
}
${nameHint}
Context: task has been waiting ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}.${veryStuck ? " It's been a WHILE — be a tiny bit more direct, still warm." : ""}
Rules:
- Tone: curious and warm, NEVER judgmental
- Mention the task by name naturally
- Two paths offered: just do it (5 min) OR let it go — give them control
- NEVER say "This task is overdue"
- One sentence. Real talk. Make them smile, not feel bad`,
    `Task: "${taskTitle}". Waiting ${daysOverdue} day${daysOverdue > 1 ? "s" : ""}.`,
    spanish
      ? { title: "oye... 👀", body: `${name ? `${name}, ` : ""}qué pasó con "${taskTitle}"? dale 5 minutos o suéltala de una.` }
      : { title: "hey... 👀", body: `${name ? `${name}, ` : ""}what happened with "${taskTitle}"? 5 min or let it go.` },
  );
}
