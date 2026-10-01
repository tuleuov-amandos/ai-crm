import { Reflector } from '@nestjs/core'
import { ClientIpThrottlerGuard } from './client-ip-throttler.guard'

// getTracker is protected on ThrottlerGuard; expose it for direct testing.
class TestableGuard extends ClientIpThrottlerGuard {
  track(req: Record<string, any>) {
    return this.getTracker(req)
  }
}

describe('ClientIpThrottlerGuard.getTracker', () => {
  const guard = new TestableGuard({ throttlers: [{ ttl: 60000, limit: 300 }] }, {} as never, new Reflector())

  const reqWith = (xff: string | string[] | undefined, ip = '10.0.0.9') => ({
    ip,
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  })

  it('uses the second-to-last XFF entry for "client, edge"', async () => {
    await expect(guard.track(reqWith('37.151.61.22, 89.222.123.193'))).resolves.toBe('37.151.61.22')
  })

  it('ignores client-supplied prefix entries for "spoof, client, edge"', async () => {
    await expect(guard.track(reqWith('6.6.6.6, 37.151.61.22, 152.233.12.245'))).resolves.toBe('37.151.61.22')
  })

  it('tolerates extra whitespace and empty segments', async () => {
    await expect(guard.track(reqWith(' 37.151.61.22 ,, 89.222.123.193 '))).resolves.toBe('37.151.61.22')
  })

  it('falls back to req.ip when XFF has a single entry', async () => {
    await expect(guard.track(reqWith('89.222.123.193', '1.2.3.4'))).resolves.toBe('1.2.3.4')
  })

  it('falls back to req.ip when there is no XFF header', async () => {
    await expect(guard.track(reqWith(undefined, '1.2.3.4'))).resolves.toBe('1.2.3.4')
  })

  it('handles XFF delivered as an array of header values', async () => {
    await expect(guard.track(reqWith(['6.6.6.6, 37.151.61.22', '89.222.123.193']))).resolves.toBe('37.151.61.22')
  })
})
