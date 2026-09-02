import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'crypto'
import envConfig from 'src/common/config'

/**
 * TODO: replace with a proper admin panel + PLATFORM_ADMIN role.
 *
 * Temporary protection for the manual tenant-approval endpoint. Instead of the
 * normal JwtAuthGuard/RolesGuard stack (there is no platform-level admin role
 * yet), it checks a shared secret sent in the `X-Internal-Admin-Token` header
 * against `INTERNAL_ADMIN_TOKEN` from the environment.
 */
@Injectable()
export class InternalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const provided = request.headers['x-internal-admin-token']

    if (typeof provided !== 'string' || !safeEqual(provided, envConfig.INTERNAL_ADMIN_TOKEN)) {
      throw new UnauthorizedException()
    }
    return true
  }
}

/** Constant-time string compare that also tolerates a length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
