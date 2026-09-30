import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable } from '@nestjs/common'
import envConfig from 'src/common/config'
import { AccessTokenPayloadCreate } from 'src/common/types/jwt.type'
import { SessionRevocationService } from 'src/common/services/session-revocation.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly sessionRevocation: SessionRevocationService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req) => req?.cookies?.['accessToken'] ?? null]),
      ignoreExpiration: false,
      secretOrKey: envConfig.ACCESS_TOKEN_SECRET,
      algorithms: ['HS256'],
    })
  }

  async validate(payload: AccessTokenPayloadCreate) {
    // A deactivated member's still-unexpired token is rejected like an expired
    // one (JwtAuthGuard turns a falsy user into a plain 401).
    if (await this.sessionRevocation.isUserRevoked(payload.userId)) {
      return null
    }
    return { userId: payload.userId, role: payload.role, tenantId: payload.tenantId }
  }
}
