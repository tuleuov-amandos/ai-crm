import { Injectable } from '@nestjs/common'
import { AppException, TenantErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { CloudinaryService, LOGO_ALLOWED_MIME, LOGO_MAX_BYTES } from 'src/common/services/cloudinary.service'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { UpdateTenantType } from './tenants.dto'

// Columns exposed by GET/PATCH /tenants/me and the logo endpoints. `id` / `slug`
// / `createdAt` are read-only context for the Settings screen; everything else
// is ADMIN-editable.
const WORKSPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  website: true,
  address: true,
  companySize: true,
  industry: true,
  timezone: true,
  defaultLocale: true,
  logoUrl: true,
} as const

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  /**
   * Workspace settings are a tenant-wide resource: only a member whose role
   * grants `manage:all` (the ADMIN default) may change them. Reads are open to
   * any authenticated member of the workspace.
   */
  private async assertCanManageWorkspace(user: AccessTokenPayload) {
    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('manage', 'all')) {
      throw AppException.forbidden(
        TenantErrorCode.FORBIDDEN,
        'Only a workspace administrator can change these settings',
      )
    }
  }

  private async loadWorkspace(tenantId: string) {
    // `Tenant` is not in the tenant-isolation extension's model list, so scope
    // the lookup by id explicitly.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: WORKSPACE_SELECT,
    })
    if (!tenant) {
      throw AppException.notFound(TenantErrorCode.NOT_FOUND, 'Workspace not found')
    }
    return tenant
  }

  getMe(tenantId: string) {
    return this.loadWorkspace(tenantId)
  }

  async updateMe(user: AccessTokenPayload, body: UpdateTenantType) {
    await this.assertCanManageWorkspace(user)

    // Drop keys the client did not send (`undefined` = leave unchanged); `null`
    // is kept — it clears the column.
    const data = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))

    if (Object.keys(data).length === 0) {
      return this.loadWorkspace(user.tenantId)
    }

    return this.prisma.tenant.update({
      where: { id: user.tenantId },
      data,
      select: WORKSPACE_SELECT,
    })
  }

  async updateLogo(user: AccessTokenPayload, file?: Express.Multer.File) {
    await this.assertCanManageWorkspace(user)

    if (!file || !file.buffer?.length) {
      throw AppException.badRequest(TenantErrorCode.LOGO_FILE_MISSING, 'No logo file was uploaded')
    }
    if (!LOGO_ALLOWED_MIME.includes(file.mimetype as (typeof LOGO_ALLOWED_MIME)[number])) {
      throw AppException.unprocessable(TenantErrorCode.LOGO_INVALID_TYPE, 'Logo must be a JPEG, PNG or WebP image')
    }
    if (file.size > LOGO_MAX_BYTES) {
      throw AppException.unprocessable(TenantErrorCode.LOGO_TOO_LARGE, 'Logo file is too large')
    }

    const logoUrl = await this.cloudinary.uploadTenantLogo(file.buffer, user.tenantId)
    return this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { logoUrl },
      select: WORKSPACE_SELECT,
    })
  }

  async removeLogo(user: AccessTokenPayload) {
    await this.assertCanManageWorkspace(user)

    await this.cloudinary.deleteTenantLogo(user.tenantId)
    return this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { logoUrl: null },
      select: WORKSPACE_SELECT,
    })
  }
}
