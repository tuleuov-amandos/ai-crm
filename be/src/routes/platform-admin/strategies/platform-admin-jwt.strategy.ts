import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable } from '@nestjs/common'
import envConfig from 'src/common/config'

interface PlatformAdminJwtPayload {
  platformAdminId: string
}

@Injectable()
export class PlatformAdminJwtStrategy extends PassportStrategy(Strategy, 'platform-admin-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req) => req?.cookies?.['platformAdminToken'] ?? null]),
      ignoreExpiration: false,
      secretOrKey: envConfig.PLATFORM_ADMIN_JWT_SECRET,
      algorithms: ['HS256'],
    })
  }

  validate(payload: PlatformAdminJwtPayload) {
    // @nestjs/passport awaits the return value, so a plain object is fine —
    // no `async` needed since there is nothing to await.
    return { platformAdminId: payload.platformAdminId }
  }
}
