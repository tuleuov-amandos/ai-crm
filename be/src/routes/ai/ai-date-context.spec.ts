import { DEFAULT_AI_TIMEZONE, getAiDateContext } from './ai-date-context'

describe('getAiDateContext', () => {
  it('returns the local date, weekday and timezone', () => {
    expect(getAiDateContext(new Date('2026-10-12T05:00:00Z'), 'Asia/Almaty')).toEqual({
      date: '2026-10-12',
      weekday: 'Monday',
      timezone: 'Asia/Almaty',
    })
  })

  it('moves to the next day across midnight in the company timezone', () => {
    // 20:30 UTC is 01:30 the next day in Asia/Almaty (UTC+5).
    expect(getAiDateContext(new Date('2026-10-11T20:30:00Z'), 'Asia/Almaty')).toEqual({
      date: '2026-10-12',
      weekday: 'Monday',
      timezone: 'Asia/Almaty',
    })
  })

  it('uses another timezone', () => {
    // 03:00 UTC is still the previous evening in New York.
    expect(getAiDateContext(new Date('2026-10-12T03:00:00Z'), 'America/New_York')).toEqual({
      date: '2026-10-11',
      weekday: 'Sunday',
      timezone: 'America/New_York',
    })
  })

  it.each([[undefined], [null], [''], ['   '], ['Not/AZone']])('falls back to the default for %p', (tz) => {
    expect(getAiDateContext(new Date('2026-10-12T05:00:00Z'), tz)).toEqual({
      date: '2026-10-12',
      weekday: 'Monday',
      timezone: DEFAULT_AI_TIMEZONE,
    })
  })
})
