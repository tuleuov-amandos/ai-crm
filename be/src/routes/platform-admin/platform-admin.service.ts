import { Injectable, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { StringValue } from 'ms'
import envConfig from 'src/common/config'
import { AppException, PlatformAdminErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { HashingService } from 'src/common/services/hashing.service'
import { rootLogger } from 'src/common/logger/root-logger'
import { LoginBodyType, TenantListItemType, UpdateTenantStatusType } from './platform-admin.model'

// Module-level logger; `requestId` is attached from CLS per request. Passwords
// and tokens are never logged — ids/emails/outcomes only.
const log = rootLogger.child({ context: 'PlatformAdminService' })

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
  ) {}

  async login(body: LoginBodyType) {
    log.info({ event: 'login.attempt', email: body.email })
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: body.email } })

    if (!admin) {
      log.warn({ event: 'login.failed', email: body.email, reason: 'admin_not_found' })
      throw AppException.unauthorized(PlatformAdminErrorCode.INVALID_CREDENTIALS, 'Incorrect email or password')
    }

    const isPasswordValid = await this.hashingService.compare(body.password, admin.password)
    if (!isPasswordValid) {
      log.warn({ event: 'login.failed', email: body.email, platformAdminId: admin.id, reason: 'bad_password' })
      throw AppException.unauthorized(PlatformAdminErrorCode.INVALID_CREDENTIALS, 'Incorrect email or password')
    }

    // Deliberately no `tenantId` in the payload: TenantInterceptor only sets the
    // CLS tenantId when `req.user.tenantId` is present, so its absence here
    // guarantees the Prisma tenant-scoping extension never filters queries made
    // under a platform-admin session.
    const token = this.jwtService.sign(
      { platformAdminId: admin.id },
      {
        secret: envConfig.PLATFORM_ADMIN_JWT_SECRET,
        expiresIn: envConfig.PLATFORM_ADMIN_JWT_EXPIRES_IN as StringValue,
      },
    )

    log.info({ event: 'login.success', email: body.email, platformAdminId: admin.id })
    return { token, admin: { id: admin.id, email: admin.email, name: admin.name } }
  }

  async getMe(platformAdminId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: platformAdminId } })
    if (!admin) {
      throw new NotFoundException('Platform admin not found')
    }
    return { id: admin.id, email: admin.email, name: admin.name }
  }

  async getTenants(): Promise<TenantListItemType[]> {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: { where: { role: { name: 'ADMIN' } }, take: 1, select: { name: true, email: true } },
        _count: { select: { users: true, contacts: true, deals: true } },
      },
    })

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
      createdAt: tenant.createdAt,
      adminName: tenant.users[0]?.name ?? null,
      adminEmail: tenant.users[0]?.email ?? null,
      userCount: tenant._count.users,
      contactCount: tenant._count.contacts,
      dealCount: tenant._count.deals,
    }))
  }

  async updateTenantStatus(tenantId: string, status: UpdateTenantStatusType['status']) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, status: true } })
    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status },
    })

    log.warn({
      event: 'platform_admin.tenant.status_changed',
      tenantId,
      from: tenant.status,
      to: status,
    })

    return updated
  }
}
