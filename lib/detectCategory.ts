import type { TaskCategory } from "./types";

const RULES: { category: TaskCategory; patterns: RegExp }[] = [
  {
    // Business first — catches marketing/agency/campaign before shopping catches "market"
    category: "business",
    patterns:
      /meeting|reuni[oó]n|client|project|deadline|office|career|email|report|presentation|review|proposal|contract|pitch|conference|standup|sprint|launch|deploy|hire|interview|follow.?up|onboard|agenc|marketing|advertis|campaign|media|brand|startup|vendor|strateg|content.?creat|prensa|newspaper|editorial|publicidad|negocio/i,
  },
  {
    category: "home",
    patterns:
      /clean|laundry|dish|vacuum|mop|repair|fix|handyman|plumber|electrician|furniture|decor|garden|lawn|trash|organiz|declutter|move|pack|unpack|rent|lease|landlord|mortgage|housing|evict/i,
  },
  {
    category: "finance",
    patterns:
      /credit.?card|debit|insurance|utilit|electric|water.?bill|gas.?bill|internet.?bill|phone.?bill|\bbill\b|invoice|payment|salary|payroll|tax|bank|loan|invest|budget|expense|subscription|fee|\bdue\b|pay.?check|money|fund|financ|wire|transfer|deposit|withdraw|balance|account|statement|premium|dues/i,
  },
  {
    category: "health",
    patterns:
      /gym|exercise|workout|doctor|dentist|therapist|pharmacy|medicine|medication|prescription|health|checkup|appointment|diet|nutrition|\brun\b|jog|yoga|meditat|mental.?health|hospital|clinic|lab.?test|blood.?test/i,
  },
  {
    category: "social",
    patterns:
      /birthday|party|wedding|anniversary|dinner|lunch|brunch|friend|family|visit|\bevent\b|celebration|gathering|invite|rsvp|\bgift\b/i,
  },
  {
    category: "shopping",
    patterns:
      /\bshop\b|shopping|\bbuy\b|purchase|groceri|supermarket|amazon|walmart|target|costco|\bstore\b|\bmarket\b|pick.?up|exchange|cable|hardware|supplies/i,
  },
  {
    category: "travel",
    patterns:
      /flight|hotel|airbnb|trip|travel|vacation|passport|visa|airport|check.?in|itinerary|suitcase|book.*ticket|reservation/i,
  },
  {
    category: "personal",
    patterns:
      /journal|diary|meditat|self.?care|reading|book.?club|habit|goal|reflect|gratitude|morning.?routine|evening.?routine/i,
  },
];

export function detectCategory(text: string): TaskCategory | null {
  for (const { category, patterns } of RULES) {
    if (patterns.test(text)) return category;
  }
  return null;
}
