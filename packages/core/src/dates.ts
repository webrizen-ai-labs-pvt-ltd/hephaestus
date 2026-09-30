/** Dates are plain "YYYY-MM-DD" strings (no time zone); arithmetic is done in UTC. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Today's date in a given IANA time zone, e.g. "Asia/Kolkata". */
export function todayIn(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type HalfDay = "none" | "first_half" | "second_half";

/**
 * Leave days between two dates (inclusive), counting only working days that
 * aren't holidays. A half day is only allowed for single-day requests.
 */
export function countLeaveDays(opts: {
  start: string;
  end: string;
  workWeek: readonly number[];
  holidays: ReadonlySet<string>;
  halfDay?: HalfDay;
}): number {
  const { start, end, workWeek, holidays, halfDay = "none" } = opts;
  if (end < start) return 0;
  let days = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (workWeek.includes(isoWeekday(d)) && !holidays.has(d)) days++;
  }
  if (halfDay !== "none" && start === end && days === 1) return 0.5;
  return days;
}
