import { HttpException, HttpStatus } from '@nestjs/common'
import { Profile } from 'passport-google-oauth20'
import { AuthErrorCode } from 'src/common/errors'
import { GoogleStrategy } from './google.strategy'

const expectAuthError = (done: jest.Mock, code: AuthErrorCode, status: HttpStatus) => {
  const err = done.mock.calls[0][0] as HttpException
  expect(err).toBeInstanceOf(HttpException)
  expect(err.getStatus()).toBe(status)
  expect((err.getResponse() as { code: string }).code).toBe(code)
  expect(done.mock.calls[0][1]).toBe(false)
}

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

  it('rejects when the Google email is not verified', () => {
    const done = jest.fn()
    const profile = {
      ...baseProfile,
      emails: [{ value: 'victim@example.com', verified: false }],
    } as unknown as Profile

    strategy.validate('token', 'refresh', profile, done)

    expectAuthError(done, AuthErrorCode.GOOGLE_EMAIL_NOT_VERIFIED, HttpStatus.UNAUTHORIZED)
  })

  it('rejects when there is no email at all', () => {
    const done = jest.fn()
    const profile = { ...baseProfile, emails: [] } as unknown as Profile

    strategy.validate('token', 'refresh', profile, done)

    expectAuthError(done, AuthErrorCode.GOOGLE_EMAIL_NOT_VERIFIED, HttpStatus.UNAUTHORIZED)
  })

  it('accepts a verified email and passes it through', () => {
    const done = jest.fn()
    const profile = {
      ...baseProfile,
      emails: [{ value: 'user@example.com', verified: true }],
    } as unknown as Profile

    strategy.validate('token', 'refresh', profile, done)

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ email: 'user@example.com', emailVerified: true }))
  })
})
