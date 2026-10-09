// What the "Analyze with AI" button and the hint under it show, as a pure
// function of (role, does the company have an AI key, is the status loading).
// Free of React and path aliases so it can be unit-tested (aiAnalyzeState.test.mjs).

/** Settings → Integrations, where an ADMIN adds the company's AI key. */
export const AI_SETTINGS_HREF = "/settings?tab=integrations";

export type AiAnalyzeHint =
  /** nothing to show */
  | "none"
  /** ADMIN: add the key in Settings → Integrations */
  | "adminAddKey"
  /** other roles: ask the administrator to add the key */
  | "askAdmin";

export interface AiAnalyzeState {
  /** AI part of the button being disabled; the caller adds its own conditions (empty note, running analysis). */
  disabled: boolean;
  hint: AiAnalyzeHint;
}

interface AiAnalyzeStateInput {
  /** Role as stored (ADMIN / MANAGER / SALES_REP), undefined until the user is loaded. */
  role: string | undefined;
  /** GET /ai/settings `configured`, undefined when there is no answer (still loading or failed). */
  configured: boolean | undefined;
  /** GET /ai/settings is loading. */
  isLoading: boolean;
}

export function getAiAnalyzeState({ role, configured, isLoading }: AiAnalyzeStateInput): AiAnalyzeState {
  // No hint until the status is known, so the text does not flash and change.
  if (isLoading) return { disabled: true, hint: "none" };
  // The status request failed: do not block on a guess, the backend answers
  // AI_KEY_NOT_CONFIGURED to an analysis without a key anyway.
  if (configured === undefined) return { disabled: false, hint: "none" };
  if (configured) return { disabled: false, hint: "none" };
  if (role === undefined) return { disabled: true, hint: "none" };
  return { disabled: true, hint: role === "ADMIN" ? "adminAddKey" : "askAdmin" };
}

/** `?tab=<id>` from a query string, when <id> is one of `tabs`; otherwise null. */
export function parseSettingsTabParam<T extends string>(
  search: string,
  tabs: readonly T[],
): T | null {
  const value = new URLSearchParams(search).get("tab");
  return tabs.find((tab) => tab === value) ?? null;
}
