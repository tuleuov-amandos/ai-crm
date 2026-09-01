import { UnauthorizedException } from '@nestjs/common'
import { Profile } from 'passport-google-oauth20'
import { GoogleStrategy } from './google.strategy'

jest.mock('src/common/config', () => ({
  __esModule: true,
  default: {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost/callback',
  },
}))

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy

  beforeEach(() => {
    strategy = new GoogleStrategy()
  })

  const baseProfile = {
    id: 'google-id-1',
    name: { givenName: 'John', familyName: 'Doe' },
    photos: [{ value: 'http://photo' }],
  } as unknown as Profile

  it('rejects when the Google email is not verified', async () => {
    const done = jest.fn()
    const profile = {
      ...baseProfile,
      emails: [{ value: 'victim@example.com', verified: false }],
    } as unknown as Profile

    await strategy.validate('token', 'refresh', profile, done)

    expect(done).toHaveBeenCalledWith(expect.any(UnauthorizedException), false)
  })

  it('rejects when there is no email at all', async () => {
    const done = jest.fn()
    const profile = { ...baseProfile, emails: [] } as unknown as Profile

    await strategy.validate('token', 'refresh', profile, done)

    expect(done).toHaveBeenCalledWith(expect.any(UnauthorizedException), false)
  })

  it('accepts a verified email and passes it through', async () => {
    const done = jest.fn()
    const profile = {
      ...baseProfile,
      emails: [{ value: 'user@example.com', verified: true }],
    } as unknown as Profile

    await strategy.validate('token', 'refresh', profile, done)

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ email: 'user@example.com', emailVerified: true }))
  })
})
