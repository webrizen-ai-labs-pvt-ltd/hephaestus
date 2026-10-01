import { addDays } from "./dates.ts";

export type Recurrence = { freq: "daily" | "weekly" | "monthly"; interval: number };

/** The next due date of a recurring task. Monthly keeps the day, clamped to the month's end. */
export function nextOccurrence(date: string, r: Recurrence): string {
  const interval = Math.max(1, Math.floor(r.interval));
  if (r.freq === "daily") return addDays(date, interval);
  if (r.freq === "weekly") return addDays(date, 7 * interval);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + interval, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Fractional board position between two neighbours (null = list edge), so a
 * move only rewrites the moved card.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024;
  if (before === null) return after! - 1024;
  if (after === null) return before + 1024;
  return (before + after) / 2;
}

/** "Website Relaunch" → "WR", "Payroll" → "PAY". Uniqueness is handled by the caller. */
export function projectKeyFrom(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "PRJ";
  const key = words.length === 1 ? words[0]!.slice(0, 3) : words.map((w) => w[0]).join("").slice(0, 4);
  return key.length >= 2 ? key : (words[0]!.slice(0, 3) || "PRJ");
}

export const DEFAULT_STAGES = [
  { name: "Backlog", category: "todo", color: "#8a8178" },
  { name: "To do", category: "todo", color: "#4c6e9e" },
  { name: "In progress", category: "in_progress", color: "#ff5a1f" },
  { name: "In review", category: "review", color: "#c8a24a" },
  { name: "Done", category: "done", color: "#2e8b6e" },
] as const;
