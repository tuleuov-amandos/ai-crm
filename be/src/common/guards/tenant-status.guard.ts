import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AppException, TenantErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'

/**
 * Blocks data access for workspaces that have not been manually approved.
 *
 * Must be listed AFTER `JwtAuthGuard` in `@UseGuards(...)` so `request.user`
 * (and thus `tenantId`) is already populated. Endpoints that must stay
 * reachable for a PENDING/SUSPENDED tenant (login, logout, `GET /auth/me`,
 * health) simply do not apply this guard.
 *
 * Status is read straight from the DB on every request (one indexed PK lookup)
 * so a SUSPEND takes effect immediately — mirrors how `AuthService.getProfile`
 * already hits the DB per request.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user?.tenantId) {
      // JwtAuthGuard should have rejected this already; fail closed just in case.
      throw new UnauthorizedException()
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { status: true },
    })

    if (!tenant || tenant.status === 'ACTIVE') {
      // A missing tenant is not this guard's concern — let downstream handlers
      // deal with the (very unlikely) dangling reference.
      return true
    }

    if (tenant.status === 'SUSPENDED') {
      throw AppException.forbidden(
        TenantErrorCode.TENANT_SUSPENDED,
        'This workspace has been suspended. Please contact support.',
      )
    }

    throw AppException.forbidden(TenantErrorCode.TENANT_PENDING, 'This workspace is awaiting approval.')
  }
}
