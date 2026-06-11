// Calendar-day helpers that respect the user's IANA timezone. The server runs
// in UTC, so date-fns isToday/isPast draw day boundaries up to a full day off
// from the user's clock; these compare local calendar dates instead. All
// helpers fall back to UTC when given an invalid timezone string.

function localDateString(d: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
}

export function isTodayInTz(d: Date, timeZone: string): boolean {
  return localDateString(d, timeZone) === localDateString(new Date(), timeZone);
}

// Whole local calendar days from `d` to now. Positive = d is on an earlier day,
// 0 = same local day, negative = future day.
export function daysAgoInTz(d: Date, timeZone: string): number {
  const utcMs = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round(
    (utcMs(localDateString(new Date(), timeZone)) - utcMs(localDateString(d, timeZone))) / 86_400_000,
  );
}

// True when the instant reads 23:59 on the user's local clock — the sentinel
// resolveDue stores for date-only tasks ("no specific time").
export function isLocalMidnightSentinel(d: Date, timeZone: string): boolean {
  let hm: string;
  try {
    hm = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    hm = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  }
  return hm === "23:59";
}
