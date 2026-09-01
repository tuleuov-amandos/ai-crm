import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable } from '@nestjs/common'
import envConfig from 'src/common/config'
import { AccessTokenPayloadCreate } from 'src/common/types/jwt.type'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req) => req?.cookies?.['accessToken'] ?? null]),
      ignoreExpiration: false,
      secretOrKey: envConfig.ACCESS_TOKEN_SECRET,
      algorithms: ['HS256'],
    })
  }

  validate(payload: AccessTokenPayloadCreate) {
    // @nestjs/passport awaits the return value, so a plain object is fine —
    // no `async` needed since there is nothing to await.
    return { userId: payload.userId, role: payload.role, tenantId: payload.tenantId }
  }
}
