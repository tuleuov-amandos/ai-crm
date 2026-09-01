"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ApiError, ApiErrorResponse } from "@/types/error.type";

type ErrorTranslator = ReturnType<typeof useTranslations<"errors">>;
type Values = Record<string, string | number | Date>;

function getErrorData(error: unknown): ApiErrorResponse | undefined {
  return (error as ApiError | undefined)?.response?.data as
    | ApiErrorResponse
    | undefined;
}

/**
 * Only primitive scalars from the response body are safe to feed into ICU
 * interpolation (e.g. `{max}`, `{windowSeconds}` for AI_RATE_LIMIT_EXCEEDED).
 */
function interpolationValues(data: ApiErrorResponse): Values {
  const values: Values = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === "string" || typeof val === "number") values[key] = val;
  }
  return values;
}

function resolve(
  t: ErrorTranslator,
  error: unknown,
  fallback?: string,
): string {
  const data = getErrorData(error);

  if (data?.code && t.has(data.code)) {
    return t(data.code, interpolationValues(data));
  }

  return fallback ?? data?.message ?? t("unknown");
}

/**
 * Resolves an error thrown by an API call to a message in the user's current
 * language.
 *
 * Priority:
 *  1. `errors.<code>` translation, when the backend sent a known `code`.
 *  2. the caller-supplied `fallback` (usually a context-specific string such as
 *     `t("createError")`).
 *  3. the raw backend `message`, if any.
 *  4. `errors.unknown`.
 */
export function useApiError() {
  const t = useTranslations("errors");
  return useCallback(
    (error: unknown, fallback?: string) => resolve(t, error, fallback),
    [t],
  );
}

/**
 * Non-hook variant for callers that already hold an `errors` translator.
 */
export function resolveApiError(
  t: ErrorTranslator,
  error: unknown,
  fallback?: string,
): string {
  return resolve(t, error, fallback);
}
