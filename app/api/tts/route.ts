import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const runtime = "nodejs";
export const maxDuration = 60;

function detectLang(text: string): "es" | "en" {
  return /[¿¡áéíóúñüÁÉÍÓÚÑ]|\b(el|la|los|las|un|una|que|de|en|es|por|para|con|listo|guardé|guardé|tienes|tengo|hoy|mañana|semana|urgente|tareas)\b/i.test(text) ? "es" : "en";
}

export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text?.trim()) return new Response("no text", { status: 400 });

  const lang = detectLang(text);
  // Dalia = warm Mexican Spanish, Jenny = natural American English
  const voice = lang === "es" ? "es-MX-DaliaNeural" : "en-US-JennyNeural";

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const chunks: Buffer[] = [];
  const { audioStream } = tts.toStream(text.trim());

  await new Promise<void>((resolve, reject) => {
    audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end", resolve);
    audioStream.on("error", reject);
  });

  return new Response(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
