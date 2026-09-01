"use client";

import { useFormatter, useTranslations } from "next-intl";
import { formatShortValue } from "@/lib/helper";

/**
 * Locale-aware compact value formatter (e.g. "2.3 B" / "2,3 млрд").
 * Wraps the pure {@link formatShortValue} with unit words from `common.units`.
 */
export function useShortValue() {
  const t = useTranslations("common.units");
  return (value?: number | null) =>
    formatShortValue(value, {
      billion: t("billion"),
      million: t("million"),
      thousand: t("thousand"),
    });
}

/**
 * Locale-aware relative time (e.g. "3 days ago" / "3 дня назад").
 * Handles past and future dates via `Intl.RelativeTimeFormat`.
 */
export function useRelativeTime() {
  const format = useFormatter();
  return (date?: string | Date | null) => {
    if (!date) return "";
    return format.relativeTime(new Date(date));
  };
}
