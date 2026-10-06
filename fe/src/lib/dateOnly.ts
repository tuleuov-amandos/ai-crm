import { format } from "date-fns";

// Calendar days travel through forms as "yyyy-MM-dd" strings. The picker
// (react-day-picker) works with LOCAL-midnight Dates, so both directions must
// use local components: Date#toISOString() converts to UTC and shifts the day
// back east of UTC, and new Date("yyyy-MM-dd") is UTC midnight and shifts the
// label back west of UTC.
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Day picked in the calendar -> "yyyy-MM-dd" (local components). */
export function toDateOnly(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * "yyyy-MM-dd" -> Date at local midnight, for Calendar `selected` and labels;
 * undefined if empty or not a real calendar day. Built from parts instead of
 * date-fns `parse`: the repo's @types/date-fns (2.5.3) still types the v1
 * one-argument `parse`.
 */
export function fromDateOnly(value: string | null | undefined): Date | undefined {
  const match = value ? DATE_ONLY_RE.exec(value) : null;
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // new Date rolls over impossible days (2026-02-30 -> March 2), so compare back.
  const same =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return same ? date : undefined;
}
