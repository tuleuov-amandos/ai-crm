import { Body, Controller, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { PrismaService } from 'src/common/services/prisma.service'
import { InternalAdminGuard } from 'src/common/guards/internal-admin.guard'
import { rootLogger } from 'src/common/logger/root-logger'
import { UpdateTenantStatusDto } from './internal-tenants.dto'

const log = rootLogger.child({ context: 'InternalTenantsController' })

/**
 * TODO: replace with a proper admin panel + PLATFORM_ADMIN role.
 *
 * Ops-only endpoint for manually approving / suspending workspaces while there
 * is no platform-admin UI. Protected by a shared secret header
 * (`X-Internal-Admin-Token`), NOT by the normal JWT/roles stack.
 */
@ApiExcludeController()
@Controller('internal/tenants')
@UseGuards(InternalAdminGuard)
export class InternalTenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: UpdateTenantStatusDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status: body.status },
      select: { id: true, name: true, slug: true, status: true },
    })

    log.warn({
      event: 'internal.tenant.status_changed',
      tenantId: id,
      from: tenant.status,
      to: body.status,
    })

    return updated
  }
}
