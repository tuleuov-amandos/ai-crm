import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { MyZodValidationPipe } from 'src/common/pipe/custom-zod-validation.pipe'
import { AiSettingsController } from './ai-settings.controller'
import { AiSettingsService } from './ai-settings.service'

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

const KEY = 'sk-controller-test-key-9876'

describe('AiSettingsController (routes and roles)', () => {
  let app: INestApplication<App>
  const service = {
    get: jest.fn(),
    update: jest.fn().mockResolvedValue({ configured: true, provider: 'groq', keyLast4: '9876' }),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiSettingsController],
      providers: [
        { provide: AiSettingsService, useValue: service },
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

  it.each(['MANAGER', 'SALES_REP'])('%s gets 403 on PUT and DELETE', async (role) => {
    const server = app.getHttpServer()
    await request(server)
      .put('/ai/settings')
      .set('x-test-role', role)
      .send({ provider: 'groq', apiKey: KEY })
      .expect(403)
    await request(server).delete('/ai/settings').set('x-test-role', role).expect(403)

    expect(service.update).not.toHaveBeenCalled()
    expect(service.remove).not.toHaveBeenCalled()
  })

  it.each(['MANAGER', 'SALES_REP'])('%s sees GET without keyLast4', async (role) => {
    // The service already omits keyLast4 for non-admins; the response schema
    // keeps it optional, so whatever the service returns is what goes out.
    service.get.mockResolvedValueOnce({ configured: true, provider: 'openai' })

    const res = await request(app.getHttpServer()).get('/ai/settings').set('x-test-role', role).expect(200)

    expect(res.body).toEqual({ configured: true, provider: 'openai' })
    expect(service.get).toHaveBeenCalledWith(expect.objectContaining({ role, tenantId: 't1' }))
  })

  it('ADMIN sees GET with keyLast4', async () => {
    service.get.mockResolvedValueOnce({ configured: true, provider: 'anthropic', keyLast4: 'WXYZ' })

    const res = await request(app.getHttpServer()).get('/ai/settings').set('x-test-role', 'ADMIN').expect(200)

    expect(res.body).toEqual({ configured: true, provider: 'anthropic', keyLast4: 'WXYZ' })
  })

  it('serializes through the response schema: stray fields never go out', async () => {
    service.get.mockResolvedValueOnce({
      configured: true,
      provider: 'openai',
      keyLast4: 'WXYZ',
      apiKey: KEY,
      encryptedKey: 'v1:a:b:c',
      tenantId: 't1',
    })

    const res = await request(app.getHttpServer()).get('/ai/settings').set('x-test-role', 'ADMIN').expect(200)

    expect(res.body).toEqual({ configured: true, provider: 'openai', keyLast4: 'WXYZ' })
  })

  it('ADMIN: PUT passes a trimmed key to the service and returns no key', async () => {
    const res = await request(app.getHttpServer())
      .put('/ai/settings')
      .set('x-test-role', 'ADMIN')
      .send({ provider: 'groq', apiKey: `  ${KEY}  ` })
      .expect(200)

    expect(service.update).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN' }), {
      provider: 'groq',
      apiKey: KEY,
    })
    expect(res.body).toEqual({ configured: true, provider: 'groq', keyLast4: '9876' })
    expect(JSON.stringify(res.body)).not.toContain(KEY)
  })

  it.each([
    ['unknown provider', { provider: 'mistral', apiKey: KEY }],
    ['uppercase provider', { provider: 'OPENAI', apiKey: KEY }],
    ['missing key', { provider: 'openai' }],
    ['key shorter than 10 after trim', { provider: 'openai', apiKey: '   short   ' }],
    ['key longer than 500', { provider: 'openai', apiKey: 'k'.repeat(501) }],
    ['extra field', { provider: 'openai', apiKey: KEY, model: 'gpt-4o' }],
  ])('PUT rejects %s with 422 and does not echo the key', async (_label, body) => {
    const res = await request(app.getHttpServer())
      .put('/ai/settings')
      .set('x-test-role', 'ADMIN')
      .send(body)
      .expect(422)

    expect(service.update).not.toHaveBeenCalled()
    expect(JSON.stringify(res.body)).not.toContain(KEY)
  })

  it('PUT carries its own 5/min throttle; GET and DELETE stay on the global limit', () => {
    const handler = (name: 'get' | 'update' | 'remove') =>
      Object.getOwnPropertyDescriptor(AiSettingsController.prototype, name)?.value as object
    const limitOf = (name: 'get' | 'update' | 'remove') =>
      Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler(name)) as unknown
    const ttlOf = (name: 'get' | 'update' | 'remove') =>
      Reflect.getMetadata(`${THROTTLER_TTL}default`, handler(name)) as unknown

    expect(limitOf('update')).toBe(5)
    expect(ttlOf('update')).toBe(60_000)
    expect(limitOf('get')).toBeUndefined()
    expect(limitOf('remove')).toBeUndefined()
  })

  it('ADMIN: DELETE returns 200', async () => {
    await request(app.getHttpServer()).delete('/ai/settings').set('x-test-role', 'ADMIN').expect(200)
    expect(service.remove).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN' }))
  })
})
