import type { TaskCategory } from "./types";

const RULES: { category: TaskCategory; patterns: RegExp }[] = [
  {
    category: "finance",
    patterns:
      /credit.?card|debit|rent|mortgage|insurance|utilit|electric|water.?bill|gas.?bill|internet.?bill|phone.?bill|bill|invoice|payment|salary|payroll|tax|bank|loan|invest|budget|expense|subscription|fee|due|pay.?check|money|fund|financ|wire|transfer|deposit|withdraw|balance|account|statement|premium|dues/i,
  },
  {
    category: "health",
    patterns:
      /gym|exercise|workout|doctor|dentist|therapist|pharmacy|medicine|medication|prescription|health|checkup|appointment|diet|nutrition|run|jog|yoga|meditat|mental.?health|hospital|clinic|lab.?test|blood.?test/i,
  },
  {
    category: "business",
    patterns:
      /meeting|client|project|deadline|office|career|email|report|presentation|review|proposal|contract|pitch|conference|standup|sprint|launch|deploy|hire|interview|follow.?up|onboard/i,
  },
  {
    category: "social",
    patterns:
      /birthday|party|wedding|anniversary|dinner|lunch|brunch|friend|family|visit|event|celebration|gathering|invite|rsvp|gift/i,
  },
  {
    category: "shopping",
    patterns:
      /shop|buy|purchase|groceri|supermarket|amazon|walmart|target|costco|store|market|order|pick.?up|return|exchange/i,
  },
  {
    category: "home",
    patterns:
      /clean|laundry|dish|vacuum|mop|repair|fix|handyman|plumber|electrician|furniture|decor|garden|lawn|trash|organiz|declutter|move|pack|unpack/i,
  },
  {
    category: "travel",
    patterns:
      /flight|hotel|airbnb|trip|travel|vacation|passport|visa|airport|check.?in|itinerary|pack|suitcase|book.*ticket|reservation/i,
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
