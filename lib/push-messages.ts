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
      temperature: 0.85,
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

export async function morningBrief(tasks: { title: string; priority: string | null }[]): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish(tasks.map((t) => t.title));
  const high = tasks.filter((t) => t.priority === "high");
  const count = tasks.length;

  if (count === 0) {
    return {
      title: spanish ? "Buenos días ☀️" : "Good morning ☀️",
      body: spanish
        ? "Sin tareas hoy. Día libre para crear algo grande."
        : "No tasks today. A free day — use it well.",
    };
  }

  const top = high[0] ?? tasks[0];
  const list = tasks.slice(0, 4).map((t) => t.title).join(", ");

  return aiMessage(
    `You write warm, personal push notification messages like a supportive friend — not a robot.
Return JSON with "title" (max 28 chars, include one emoji) and "body" (max 90 chars).
${spanish ? "Write in Spanish." : "Write in English."}
Tone: energizing, specific, human. Mention the most important task by name. Not cheesy.`,
    `${count} task${count > 1 ? "s" : ""} today. Most important: "${top.title}". Others: ${list}.`,
    {
      title: spanish ? "Buenos días ☀️" : "Good morning ☀️",
      body: spanish
        ? `${count} tarea${count > 1 ? "s" : ""} hoy. La más importante: ${top.title}.`
        : `${count} task${count > 1 ? "s" : ""} today. Start with: ${top.title}.`,
    },
  );
}

export async function eveningLetter(
  completedCount: number,
  openTasks: { title: string; priority: string | null }[],
): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish(openTasks.map((t) => t.title));
  const topOpen = openTasks[0];

  return aiMessage(
    `You write warm evening push notifications like a caring friend wrapping up the day.
Return JSON with "title" (max 28 chars, include one calming emoji) and "body" (max 100 chars).
${spanish ? "Write in Spanish." : "Write in English."}
Tone: calm, warm, proud — never guilt. Acknowledge wins. One gentle mention of what's next. End peacefully.`,
    `Completed today: ${completedCount}. Still open: ${openTasks.length}.${topOpen ? ` Most important remaining: "${topOpen.title}".` : " Everything done!"}`,
    {
      title: spanish ? "Fin del día 🌙" : "Day wrap 🌙",
      body:
        completedCount > 0
          ? spanish
            ? `Cerraste ${completedCount} tarea${completedCount > 1 ? "s" : ""} hoy.${topOpen ? ` Mañana: ${topOpen.title}.` : " Todo listo."} Descansa bien.`
            : `You closed ${completedCount} task${completedCount > 1 ? "s" : ""} today.${topOpen ? ` Tomorrow: ${topOpen.title}.` : " All clear."} Rest well.`
          : spanish
          ? `Mañana es un nuevo día.${topOpen ? ` Empieza con: ${topOpen.title}.` : ""} Descansa bien.`
          : `Tomorrow is a fresh start.${topOpen ? ` Begin with: ${topOpen.title}.` : ""} Rest well.`,
    },
  );
}

export async function stuckNudge(
  taskTitle: string,
  daysOverdue: number,
): Promise<{ title: string; body: string }> {
  const spanish = detectSpanish([taskTitle]);

  return aiMessage(
    `You write honest, kind push notifications for tasks someone has been avoiding.
Return JSON with "title" (max 28 chars) and "body" (max 90 chars).
${spanish ? "Write in Spanish." : "Write in English."}
Tone: direct but warm, never guilt-tripping. Give them two options: do it in 5 min or let it go. Mention the task by name.`,
    `Task: "${taskTitle}". Overdue by ${daysOverdue} days.`,
    {
      title: spanish ? "Sigue ahí... 👀" : "Still waiting... 👀",
      body: spanish
        ? `"${taskTitle}" lleva ${daysOverdue} días. Dale 5 minutos ahora o suéltala.`
        : `"${taskTitle}" has waited ${daysOverdue} days. Do it in 5 min or let it go.`,
    },
  );
}
