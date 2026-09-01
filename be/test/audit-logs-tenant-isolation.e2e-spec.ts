import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from './../src/app.module'
import { PrismaService } from '../src/common/services/prisma.service'
import { TokenService } from '../src/common/services/token.service'

describe('Audit logs tenant isolation (e2e)', () => {
  let app: INestApplication<App>
  let prisma: PrismaService
  let tokenService: TokenService

  let tenantA: { id: string }
  let tenantB: { id: string }
  let userA: { id: string }
  let userB: { id: string }
  let auditLogA: { id: string }
  let auditLogB: { id: string }
  let accessTokenB: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.use(cookieParser())
    await app.init()

    prisma = app.get(PrismaService)
    tokenService = app.get(TokenService)

    const suffix = Date.now()

    tenantA = await prisma.tenant.create({
      data: { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}` },
    })
    tenantB = await prisma.tenant.create({
      data: { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}` },
    })

    const roleA = await prisma.role.create({
      data: { tenantId: tenantA.id, name: 'ADMIN' },
    })
    const roleB = await prisma.role.create({
      data: { tenantId: tenantB.id, name: 'ADMIN' },
    })

    userA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `user-a-${suffix}@example.com`,
        name: 'User A',
        roleId: roleA.id,
      },
    })
    userB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: `user-b-${suffix}@example.com`,
        name: 'User B',
        roleId: roleB.id,
      },
    })

    auditLogA = await prisma.auditLog.create({
      data: {
        tenantId: tenantA.id,
        userId: userA.id,
        action: 'CREATE',
        targetType: 'DEAL',
        targetId: 'deal-a-1',
        targetName: 'Secret Deal A',
        changes: {},
      },
    })
    auditLogB = await prisma.auditLog.create({
      data: {
        tenantId: tenantB.id,
        userId: userB.id,
        action: 'CREATE',
        targetType: 'DEAL',
        targetId: 'deal-b-1',
        targetName: 'Deal B',
        changes: {},
      },
    })

    accessTokenB = await tokenService.signAccessToken({
      userId: userB.id,
      role: 'ADMIN',
      tenantId: tenantB.id,
    })
  })

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } })
    await prisma.role.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } })
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } })
    await prisma.$disconnect()
    await app.close()
  })

  it('does not leak another tenant audit logs to the requesting tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Cookie', [`accessToken=${accessTokenB}`])
      .expect(200)

    const ids: string[] = res.body.data.map((log: { id: string }) => log.id)

    expect(ids).not.toContain(auditLogA.id)
    expect(ids).toContain(auditLogB.id)
    expect(res.body.data.every((log: { tenantId: string }) => log.tenantId === tenantB.id)).toBe(true)
  })
})
