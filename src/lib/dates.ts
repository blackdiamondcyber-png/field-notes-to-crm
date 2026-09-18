const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTH_ALIASES: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseNotedAt(notedAt: string): Date {
  const d = new Date(`${notedAt}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid noted_at date: ${notedAt}`);
  }
  return d;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function endOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0));
}

function nextWeekday(date: Date, targetDow: number): Date {
  const currentDow = date.getUTCDay();
  let diff = (targetDow - currentDow + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(date, diff);
}

/**
 * Resolves a relative date phrase found in a field note to an absolute ISO
 * date (YYYY-MM-DD), anchored to the note's noted_at date. Returns null when
 * the phrase does not describe a resolvable calendar date (e.g. "after the
 * holiday" with no named holiday, or when no date phrase is present).
 *
 * Handles month/year boundary crossing naturally because it always operates
 * on real Date arithmetic anchored at noted_at, never on the current
 * wall-clock date.
 */
export function resolveRelativeDate(
  phrase: string,
  notedAt: string,
): string | null {
  const anchor = parseNotedAt(notedAt);
  const p = phrase.trim().toLowerCase();

  if (p === "") return null;
  if (p === "today") return toIso(anchor);
  if (p === "tomorrow") return toIso(addDays(anchor, 1));
  if (p === "day after tomorrow") return toIso(addDays(anchor, 2));

  if (p === "end of month" || p === "end of the month") {
    return toIso(endOfMonth(anchor));
  }
  if (p === "end of next month") {
    return toIso(endOfNextMonth(anchor));
  }

  if (p === "next month") {
    const d = new Date(
      Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() + 1,
        anchor.getUTCDate(),
      ),
    );
    return toIso(d);
  }

  if (p === "next week") {
    return toIso(addDays(anchor, 7));
  }

  const inDaysMatch = /^in (\d+) days?$/.exec(p);
  if (inDaysMatch?.[1] !== undefined) {
    return toIso(addDays(anchor, Number.parseInt(inDaysMatch[1], 10)));
  }

  const inWeeksMatch = /^in (\d+) weeks?$/.exec(p);
  if (inWeeksMatch?.[1] !== undefined) {
    return toIso(addDays(anchor, Number.parseInt(inWeeksMatch[1], 10) * 7));
  }

  const nextWeekdayMatch = /^next (\w+)$/.exec(p);
  if (
    nextWeekdayMatch?.[1] !== undefined &&
    nextWeekdayMatch[1] in WEEKDAY_ALIASES
  ) {
    const dow = WEEKDAY_ALIASES[nextWeekdayMatch[1]] as number;
    return toIso(nextWeekday(anchor, dow));
  }

  const bareWeekdayMatch = /^(this )?(\w+)$/.exec(p);
  if (
    bareWeekdayMatch?.[2] !== undefined &&
    bareWeekdayMatch[2] in WEEKDAY_ALIASES
  ) {
    const dow = WEEKDAY_ALIASES[bareWeekdayMatch[2]] as number;
    return toIso(nextWeekday(anchor, dow));
  }

  // "Month Day" or "Month Day, Year" e.g. "jan 3" or "january 3 2027"
  const monthDayMatch =
    /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/.exec(p);
  if (monthDayMatch?.[1] !== undefined && monthDayMatch[1] in MONTH_ALIASES) {
    const month = MONTH_ALIASES[monthDayMatch[1]] as number;
    const day = Number.parseInt(monthDayMatch[2] as string, 10);
    let year =
      monthDayMatch[3] !== undefined
        ? Number.parseInt(monthDayMatch[3], 10)
        : anchor.getUTCFullYear();
    let candidate = new Date(Date.UTC(year, month, day));
    // If no explicit year was given and the resulting date is in the past
    // relative to the anchor, assume it rolled into next year (handles
    // notes made in December about January dates).
    if (
      monthDayMatch[3] === undefined &&
      candidate.getTime() < anchor.getTime()
    ) {
      year += 1;
      candidate = new Date(Date.UTC(year, month, day));
    }
    return toIso(candidate);
  }

  // Already an ISO date
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p);
  if (isoMatch) {
    return p;
  }

  return null;
}

export function isKnownWeekdayName(word: string): boolean {
  return WEEKDAYS.includes(word.toLowerCase());
}
