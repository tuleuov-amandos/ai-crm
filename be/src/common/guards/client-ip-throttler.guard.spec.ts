import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Throttle } from '@nestjs/throttler'
import jwt from 'jsonwebtoken'
import envConfig from 'src/common/config'
import { ClientIpThrottlerGuard } from './client-ip-throttler.guard'

// getTracker is protected on ThrottlerGuard; expose it for direct testing.
class TestableGuard extends ClientIpThrottlerGuard {
  track(req: Record<string, any>, context?: ExecutionContext) {
    return this.getTracker(req, context)
  }
}

const BRUTE_FORCE_GUARD_THROTTLE = { default: { limit: 5, ttl: 60000 } }

class SampleController {
  @Throttle(BRUTE_FORCE_GUARD_THROTTLE)
  strict() {}

  relaxed() {}
}

@Throttle(BRUTE_FORCE_GUARD_THROTTLE)
class StrictClassController {
  inherited() {}
}

const contextFor = (cls: new () => object, handler: string) =>
  ({
    getClass: () => cls,
    getHandler: () => (cls.prototype as Record<string, () => void>)[handler],
  }) as unknown as ExecutionContext

describe('ClientIpThrottlerGuard.getTracker', () => {
  const guard = new TestableGuard({ throttlers: [{ ttl: 60000, limit: 300 }] }, {} as never, new Reflector())

  const reqWith = (xff: string | string[] | undefined, ip = '10.0.0.9', accessToken?: string) => ({
    ip,
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    cookies: accessToken === undefined ? {} : { accessToken },
  })

  const sign = (secret = envConfig.ACCESS_TOKEN_SECRET, expiresIn: number | string = '15m') =>
    jwt.sign({ userId: 'user-1', role: 'ADMIN', tenantId: 'tenant-1' }, secret, {
      algorithm: 'HS256',
      expiresIn: expiresIn as never,
    })

  it('uses the second-to-last XFF entry for "client, edge"', async () => {
    await expect(guard.track(reqWith('37.151.61.22, 89.222.123.193'))).resolves.toBe('ip:37.151.61.22')
  })

  it('ignores client-supplied prefix entries for "spoof, client, edge"', async () => {
    await expect(guard.track(reqWith('6.6.6.6, 37.151.61.22, 152.233.12.245'))).resolves.toBe('ip:37.151.61.22')
  })

  it('tolerates extra whitespace and empty segments', async () => {
    await expect(guard.track(reqWith(' 37.151.61.22 ,, 89.222.123.193 '))).resolves.toBe('ip:37.151.61.22')
  })

  it('falls back to req.ip when XFF has a single entry', async () => {
    await expect(guard.track(reqWith('89.222.123.193', '1.2.3.4'))).resolves.toBe('ip:1.2.3.4')
  })

  it('falls back to req.ip when there is no XFF header', async () => {
    await expect(guard.track(reqWith(undefined, '1.2.3.4'))).resolves.toBe('ip:1.2.3.4')
  })

  it('handles XFF delivered as an array of header values', async () => {
    await expect(guard.track(reqWith(['6.6.6.6, 37.151.61.22', '89.222.123.193']))).resolves.toBe('ip:37.151.61.22')
  })

  describe('authenticated requests', () => {
    it('tracks by user for a valid access token', async () => {
      await expect(guard.track(reqWith('37.151.61.22, 89.222.123.193', '10.0.0.9', sign()))).resolves.toBe(
        'user:user-1',
      )
    })

    it('tracks by user for a valid token even without XFF', async () => {
      await expect(guard.track(reqWith(undefined, '10.0.0.9', sign()))).resolves.toBe('user:user-1')
    })

    it('falls back to the client IP when the signature is wrong', async () => {
      await expect(
        guard.track(reqWith('37.151.61.22, 89.222.123.193', '10.0.0.9', sign('some-other-secret'))),
      ).resolves.toBe('ip:37.151.61.22')
    })

    it('falls back to the client IP when the token is expired', async () => {
      await expect(
        guard.track(reqWith('37.151.61.22, 89.222.123.193', '10.0.0.9', sign(undefined, -10))),
      ).resolves.toBe('ip:37.151.61.22')
    })

    it('falls back to the client IP for a malformed token', async () => {
      await expect(guard.track(reqWith('37.151.61.22, 89.222.123.193', '10.0.0.9', 'not-a-jwt'))).resolves.toBe(
        'ip:37.151.61.22',
      )
    })

    it('rejects an unsigned (alg none) token', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId: 'victim' })}.`
      await expect(guard.track(reqWith('37.151.61.22, 89.222.123.193', '10.0.0.9', unsigned))).resolves.toBe(
        'ip:37.151.61.22',
      )
    })

    it('falls back to the client IP when cookies are missing entirely', async () => {
      await expect(guard.track({ ip: '1.2.3.4', headers: {} })).resolves.toBe('ip:1.2.3.4')
    })

    it('falls back to the client IP when a signed token has no userId', async () => {
      const token = jwt.sign({ role: 'ADMIN' }, envConfig.ACCESS_TOKEN_SECRET, { algorithm: 'HS256' })
      await expect(guard.track(reqWith(undefined, '1.2.3.4', token))).resolves.toBe('ip:1.2.3.4')
    })
  })

  describe('routes with an explicit @Throttle override', () => {
    const xff = '37.151.61.22, 89.222.123.193'
    const guardWithOptions = async () => {
      const g = new TestableGuard({ throttlers: [{ ttl: 60000, limit: 300 }] }, {} as never, new Reflector())
      await g.onModuleInit()
      return g
    }

    it('keeps the IP tracker for a valid token on a @Throttle handler', async () => {
      const g = await guardWithOptions()
      await expect(g.track(reqWith(xff, '10.0.0.9', sign()), contextFor(SampleController, 'strict'))).resolves.toBe(
        'ip:37.151.61.22',
      )
    })

    it('keeps the IP tracker for a valid token on a class-level @Throttle', async () => {
      const g = await guardWithOptions()
      await expect(
        g.track(reqWith(xff, '10.0.0.9', sign()), contextFor(StrictClassController, 'inherited')),
      ).resolves.toBe('ip:37.151.61.22')
    })

    it('uses the user tracker for a valid token on a handler without @Throttle', async () => {
      const g = await guardWithOptions()
      await expect(g.track(reqWith(xff, '10.0.0.9', sign()), contextFor(SampleController, 'relaxed'))).resolves.toBe(
        'user:user-1',
      )
    })

    it('uses the IP tracker without a token on a handler without @Throttle', async () => {
      const g = await guardWithOptions()
      await expect(g.track(reqWith(xff), contextFor(SampleController, 'relaxed'))).resolves.toBe('ip:37.151.61.22')
    })
  })
})
