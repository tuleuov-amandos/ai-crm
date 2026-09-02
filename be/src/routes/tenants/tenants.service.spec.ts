import { Test, TestingModule } from '@nestjs/testing'
import { HttpException, HttpStatus } from '@nestjs/common'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { TenantErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { CloudinaryService } from 'src/common/services/cloudinary.service'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { TenantsService } from './tenants.service'

// Only the authorization seam is under test here: every mutating endpoint must
// go through `CaslAbilityFactory` and reject a caller without `manage:all`.
// Field-level DTO validation lives with the Zod schema, not here.

const expectForbidden = async (promise: Promise<unknown>) => {
  const err: unknown = await promise.then(
    () => {
      throw new Error('expected promise to reject')
    },
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(HttpException)
  expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN)
  expect(((err as HttpException).getResponse() as { code: string }).code).toBe(TenantErrorCode.FORBIDDEN)
}

// A real CASL ability so `.cannot('manage', 'all')` behaves exactly as in prod.
const adminAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('manage', 'all')
  return build()
}
const salesRepAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('read', 'Deal')
  can('update', 'Deal', { ownerId: 'u1' })
  return build()
}

const ADMIN: AccessTokenPayload = { userId: 'u1', role: 'ADMIN', tenantId: 't1', iat: 0, exp: 0 }
const SALES_REP: AccessTokenPayload = { userId: 'u2', role: 'SALES_REP', tenantId: 't1', iat: 0, exp: 0 }

const PNG_FILE = { buffer: Buffer.from('png-bytes'), mimetype: 'image/png', size: 9 } as Express.Multer.File

describe('TenantsService — authorization', () => {
  let service: TenantsService

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  }
  const mockCloudinary = {
    uploadTenantLogo: jest.fn(),
    deleteTenantLogo: jest.fn(),
  }
  const mockCaslAbilityFactory = {
    createForUser: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', name: 'Acme', slug: 'acme' })
    mockPrisma.tenant.update.mockResolvedValue({ id: 't1', name: 'Acme', slug: 'acme' })
    mockCloudinary.uploadTenantLogo.mockResolvedValue('https://cdn/tenant_t1.webp')
    mockCloudinary.deleteTenantLogo.mockResolvedValue(undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CloudinaryService, useValue: mockCloudinary },
        { provide: CaslAbilityFactory, useValue: mockCaslAbilityFactory },
      ],
    }).compile()

    service = module.get<TenantsService>(TenantsService)
  })

  describe('updateMe', () => {
    it('rejects a role without manage:all and never touches the row', async () => {
      mockCaslAbilityFactory.createForUser.mockResolvedValue(salesRepAbility())

      await expectForbidden(service.updateMe(SALES_REP, { name: 'Hacked Inc' }))

      expect(mockCaslAbilityFactory.createForUser).toHaveBeenCalledWith(SALES_REP)
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled()
    })

    it('lets an ADMIN (manage:all) through', async () => {
      mockCaslAbilityFactory.createForUser.mockResolvedValue(adminAbility())

      await service.updateMe(ADMIN, { name: 'Acme Renamed' })

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: { name: 'Acme Renamed' } }),
      )
    })
  })

  describe('updateLogo', () => {
    it('rejects a role without manage:all before hitting storage', async () => {
      mockCaslAbilityFactory.createForUser.mockResolvedValue(salesRepAbility())

      await expectForbidden(service.updateLogo(SALES_REP, PNG_FILE))

      expect(mockCloudinary.uploadTenantLogo).not.toHaveBeenCalled()
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled()
    })

    it('lets an ADMIN upload', async () => {
      mockCaslAbilityFactory.createForUser.mockResolvedValue(adminAbility())

      await service.updateLogo(ADMIN, PNG_FILE)

      expect(mockCloudinary.uploadTenantLogo).toHaveBeenCalledWith(PNG_FILE.buffer, 't1')
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: { logoUrl: 'https://cdn/tenant_t1.webp' } }),
      )
    })
  })

  describe('removeLogo', () => {
    it('rejects a role without manage:all before deleting anything', async () => {
      mockCaslAbilityFactory.createForUser.mockResolvedValue(salesRepAbility())

      await expectForbidden(service.removeLogo(SALES_REP))

      expect(mockCloudinary.deleteTenantLogo).not.toHaveBeenCalled()
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled()
    })

    it('lets an ADMIN clear the logo', async () => {
      mockCaslAbilityFactory.createForUser.mockResolvedValue(adminAbility())

      await service.removeLogo(ADMIN)

      expect(mockCloudinary.deleteTenantLogo).toHaveBeenCalledWith('t1')
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: { logoUrl: null } }),
      )
    })
  })
})
