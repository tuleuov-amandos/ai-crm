// Month labels for report chart axes and tooltips.
// The reports API sends the month either as "T{n}" (n = 1..12, no year) or,
// defensively, as "YYYY-MM". Year and month are parsed as numbers, never via
// `new Date("2026-09")`, so the result does not depend on the local time zone.

export type MonthLabelStyle = "short" | "long";

const MONTH_RE = /^(?:(\d{4})-(0?[1-9]|1[0-2])|T(0?[1-9]|1[0-2]))$/;

/** Splits a raw API month into numbers; `null` for anything unrecognised. */
export function parseMonth(raw: unknown): { year?: number; month: number } | null {
  if (typeof raw !== "string") return null;
  const match = MONTH_RE.exec(raw.trim());
  if (!match) return null;
  if (match[1] !== undefined) return { year: Number(match[1]), month: Number(match[2]) };
  return { month: Number(match[3]) };
}

/**
 * "short" -> "сент." / "Sep" (axis); "long" -> "Сентябрь 2026" / "September 2026" (tooltip).
 * The year is shown only when known (from the value itself or `fallbackYear`).
 * Unrecognised input (empty, unexpected format) is returned unchanged.
 */
export function formatMonthLabel(
  raw: unknown,
  locale: string,
  style: MonthLabelStyle = "short",
  fallbackYear?: number,
): string {
  const parsed = parseMonth(raw);
  if (!parsed) return raw == null ? "" : String(raw);
  const year = parsed.year ?? fallbackYear;
  try {
    // UTC on both sides: the Date is only a carrier for year + month.
    const date = new Date(Date.UTC(year ?? 2000, parsed.month - 1, 1));
    if (style === "short") {
      return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date);
    }
    const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(date);
    const label = year === undefined ? monthName : `${monthName} ${year}`;
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  } catch {
    return String(raw);
  }
}
