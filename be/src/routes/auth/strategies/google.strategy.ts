import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20'
import envConfig from 'src/common/config'

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: envConfig.GOOGLE_CLIENT_ID,
      clientSecret: envConfig.GOOGLE_CLIENT_SECRET,
      callbackURL: envConfig.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile'],
    })
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback): Promise<void> {
    const { id, name, emails, photos } = profile
    const primaryEmail = emails?.[0]

    // Google's `verified` flag confirms the caller actually owns this
    // mailbox (via Google's own verification or, for Workspace domains,
    // domain ownership). Without this check, anyone can claim an arbitrary
    // email through Google OAuth, and the account-linking logic below would
    // silently attach their Google identity to that email's existing
    // password-based account — a full account takeover.
    if (!primaryEmail?.value || !primaryEmail.verified) {
      return done(new UnauthorizedException('Email Google chưa được xác minh'), false)
    }

    const user = {
      provider: 'google',
      providerAccountId: id,
      email: primaryEmail.value,
      emailVerified: primaryEmail.verified,
      name: name?.givenName + ' ' + name?.familyName,
      picture: photos?.[0]?.value,
      accessToken,
    }
    done(null, user)
  }
}
