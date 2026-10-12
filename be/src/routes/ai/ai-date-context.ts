export const DEFAULT_AI_TIMEZONE = 'Asia/Almaty'

export interface AiDateContext {
  /** Local date in the company timezone, YYYY-MM-DD. */
  date: string
  /** English weekday name, e.g. "Monday". */
  weekday: string
  /** The timezone that was actually used (the default when the given one is empty or invalid). */
  timezone: string
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function getAiDateContext(now: Date, timezone?: string | null): AiDateContext {
  const requested = timezone?.trim()
  const tz = requested && isValidTimeZone(requested) ? requested : DEFAULT_AI_TIMEZONE

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''

  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday'), timezone: tz }
}
