import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { MyZodValidationPipe } from 'src/common/pipe/custom-zod-validation.pipe'
import { PipelineStagesController } from './pipeline-stages.controller'
import { PipelineStagesService } from './pipeline-stages.service'

// HTTP-level check of the route table: the real RolesGuard and the real Zod
// validation pipe, with JwtAuthGuard replaced by a stub that takes the role
// from a test header and TenantStatusGuard allowing everything.

class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    req.user = { userId: 'u1', tenantId: 't1', role: req.headers['x-test-role'] }
    return true
  }
}

const STAGE = { id: 's1', name: 'Лид', color: 'blue', order: 0, probability: 10, kind: 'OPEN', legacyKey: 'PROSPECT' }

describe('PipelineStagesController (routes and roles)', () => {
  let app: INestApplication<App>
  const service = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue(STAGE),
    update: jest.fn().mockResolvedValue(STAGE),
    reorder: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelineStagesController],
      providers: [
        { provide: PipelineStagesService, useValue: service },
        { provide: APP_PIPE, useClass: MyZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeJwtGuard)
      .overrideGuard(TenantStatusGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => jest.clearAllMocks())

  const validCreate = { name: 'Демо', color: 'teal', probability: 20 }

  it.each(['MANAGER', 'SALES_REP'])('%s gets 403 on every write endpoint', async (role) => {
    const server = app.getHttpServer()
    await request(server).post('/pipeline-stages').set('x-test-role', role).send(validCreate).expect(403)
    await request(server).patch('/pipeline-stages/s1').set('x-test-role', role).send({ name: 'X' }).expect(403)
    await request(server)
      .patch('/pipeline-stages/reorder')
      .set('x-test-role', role)
      .send({ stageIds: ['s1'] })
      .expect(403)
    await request(server).delete('/pipeline-stages/s1').set('x-test-role', role).expect(403)

    expect(service.create).not.toHaveBeenCalled()
    expect(service.update).not.toHaveBeenCalled()
    expect(service.reorder).not.toHaveBeenCalled()
    expect(service.remove).not.toHaveBeenCalled()
  })

  it.each(['ADMIN', 'MANAGER', 'SALES_REP'])('%s can list stages', async (role) => {
    await request(app.getHttpServer()).get('/pipeline-stages').set('x-test-role', role).expect(200)
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ role }))
  })

  it('serializes the list through the response schema (dealCount kept, internals dropped)', async () => {
    const stage = {
      id: 's1',
      name: 'Лид',
      color: 'blue',
      order: 0,
      probability: 10,
      kind: 'OPEN',
      legacyKey: 'PROSPECT',
    }
    service.list.mockResolvedValueOnce([{ ...stage, dealCount: 2, tenantId: 't1', createdAt: new Date() }])

    const res = await request(app.getHttpServer()).get('/pipeline-stages').set('x-test-role', 'ADMIN').expect(200)

    expect(res.body).toEqual([{ ...STAGE, dealCount: 2 }])
  })

  it('routes PATCH /reorder to reorder, not to PATCH /:id', async () => {
    await request(app.getHttpServer())
      .patch('/pipeline-stages/reorder')
      .set('x-test-role', 'ADMIN')
      .send({ stageIds: ['a', 'b'] })
      .expect(200)

    expect(service.reorder).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN' }), { stageIds: ['a', 'b'] })
    expect(service.update).not.toHaveBeenCalled()
  })

  it.each(['green', 'red'])('rejects the reserved color %s for a new stage', async (color) => {
    await request(app.getHttpServer())
      .post('/pipeline-stages')
      .set('x-test-role', 'ADMIN')
      .send({ ...validCreate, color })
      .expect(422)
    expect(service.create).not.toHaveBeenCalled()
  })

  it('does not accept kind on create (no second WON/LOST through the API)', async () => {
    await request(app.getHttpServer())
      .post('/pipeline-stages')
      .set('x-test-role', 'ADMIN')
      .send({ ...validCreate, kind: 'WON' })
      .expect(422)
    expect(service.create).not.toHaveBeenCalled()
  })

  it('passes a trimmed name and targetStageId from the query', async () => {
    const server = app.getHttpServer()
    await request(server)
      .post('/pipeline-stages')
      .set('x-test-role', 'ADMIN')
      .send({ ...validCreate, name: '  Демо  ' })
      .expect(201)
    expect(service.create).toHaveBeenCalledWith(expect.anything(), { ...validCreate, name: 'Демо' })

    await request(server).delete('/pipeline-stages/s1?targetStageId=s2').set('x-test-role', 'ADMIN').expect(200)
    expect(service.remove).toHaveBeenCalledWith(expect.anything(), 's1', { targetStageId: 's2' })
  })
})
