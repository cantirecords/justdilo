export type EnergyTag = "call" | "quick" | "deep" | "errand";

const rules: [EnergyTag, RegExp][] = [
  ["call", /\b(call|phone|ring|speak|talk to|contact|reach out|whatsapp|text)\b/i],
  ["errand", /\b(pick up|drop off|buy|get|shop|store|deliver|bring|collect|go to)\b/i],
  ["deep", /\b(review|write|plan|design|build|create|analyze|research|prepare|draft|develop|study)\b/i],
  ["quick", /\b(send|email|reply|confirm|check|update|ping|share|forward|upload|post|submit)\b/i],
];

export function detectEnergy(title: string): EnergyTag | null {
  for (const [tag, re] of rules) {
    if (re.test(title)) return tag;
  }
  return null;
}

export const energyConfig: Record<EnergyTag, { label: string; color: string }> = {
  call:   { label: "Call",   color: "bg-blue-100 text-blue-600" },
  quick:  { label: "Quick",  color: "bg-green-100 text-green-600" },
  deep:   { label: "Focus",  color: "bg-purple-100 text-purple-600" },
  errand: { label: "Errand", color: "bg-amber-100 text-amber-600" },
};
