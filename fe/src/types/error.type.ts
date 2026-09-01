import { AxiosError } from 'axios'

export interface ApiErrorResponse {
  message: string
  statusCode: number
  error?: string
  /**
   * Stable, machine-readable error code emitted by the backend (see
   * `be/src/common/errors`). The frontend maps it to a localized string via the
   * `errors` namespace in `messages/*.json` — use the `useApiError` hook.
   */
  code?: string
  /**
   * Field path for validation errors (e.g. "password", "contacts.0.name").
   * Present on 422 responses whose `code` is one of the `VALIDATION_*` codes.
   * Not localized — for debugging only; the user-facing text comes from `code`.
   */
  path?: string
  /** Present on rate-limit (429) responses. */
  retryAfter?: number
  /** Interpolation values shipped with some codes (e.g. AI_RATE_LIMIT_EXCEEDED). */
  max?: number
  windowSeconds?: number
}

export type ApiError = AxiosError<ApiErrorResponse>
