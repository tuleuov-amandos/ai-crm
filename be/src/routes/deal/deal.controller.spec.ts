import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { MyZodValidationPipe } from 'src/common/pipe/custom-zod-validation.pipe'
import { ValidationErrorCode } from 'src/common/errors'
import { DealController } from './deal.controller'
import { DealService } from './deal.service'
import { AiService } from '../ai/ai.service'

// These modules open Redis connections at import time; not needed here.
jest.mock('../ai/ai.service', () => ({ AiService: class {} }))
jest.mock('../ai/ai.sse', () => ({ subscribeToAiStream: jest.fn() }))
jest.mock('src/common/guards/ai-rate-limit.guard', () => ({
  AiRateLimitGuard: class {
    canActivate() {
      return true
    }
  },
}))

// HTTP-level check of the archive routes and the board query: the real Zod
// validation pipe and serializer, the service stubbed.

class FakeJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest()
    req.user = { userId: 'u1', tenantId: 't1', role: 'ADMIN' }
    return true
  }
}

const USER = { userId: 'u1', tenantId: 't1', role: 'ADMIN' }

describe('DealController archive routes', () => {
  let app: INestApplication<App>
  const service = {
    setArchived: jest.fn().mockResolvedValue({ updated: 2 }),
    getBoard: jest.fn().mockResolvedValue([]),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DealController],
      providers: [
        { provide: DealService, useValue: service },
        { provide: AiService, useValue: {} },
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

  const ids = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`)

  it.each([
    ['archive', true],
    ['unarchive', false],
  ])('POST /deals/%s answers 201 { updated } and passes the ids through', async (path, archived) => {
    const res = await request(app.getHttpServer())
      .post(`/deals/${path}`)
      .send({ dealIds: ['d1', 'd2'] })
      .expect(201)

    expect(res.body).toEqual({ updated: 2 })
    expect(service.setArchived).toHaveBeenCalledWith('t1', ['d1', 'd2'], archived, USER)
  })

  it('accepts exactly 200 ids', async () => {
    await request(app.getHttpServer())
      .post('/deals/archive')
      .send({ dealIds: ids(200) })
      .expect(201)
  })

  it.each([
    ['an empty array', { dealIds: [] }],
    ['201 ids', { dealIds: ids(201) }],
    ['no dealIds', {}],
    ['an empty id', { dealIds: [''] }],
    ['a non-string id', { dealIds: [1] }],
    ['an unknown key', { dealIds: ['d1'], archived: true }],
  ])('rejects %s with 422 on both routes', async (_name, body) => {
    for (const path of ['archive', 'unarchive']) {
      const res = await request(app.getHttpServer()).post(`/deals/${path}`).send(body).expect(422)
      expect(Object.values(ValidationErrorCode)).toContain(res.body.code)
    }
    expect(service.setArchived).not.toHaveBeenCalled()
  })

  it('GET /deals/board passes includeArchived through and rejects other values with 422', async () => {
    const server = app.getHttpServer()
    await request(server).get('/deals/board?includeArchived=true').expect(200)
    await request(server).get('/deals/board').expect(200)
    await request(server).get('/deals/board?includeArchived=yes').expect(422)

    expect(service.getBoard).toHaveBeenCalledTimes(2)
    expect(service.getBoard).toHaveBeenNthCalledWith(1, 't1', USER, { includeArchived: 'true' })
    expect(service.getBoard).toHaveBeenNthCalledWith(2, 't1', USER, {})
  })
})
