import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

// Behind Railway the X-Forwarded-For chain is "<client>, <proxy node>", and the
// proxy node's address rotates between requests. With `trust proxy 1` Express
// returns the rightmost entry (the node), so one client would be spread over
// many throttle buckets and never hit a limit.
//
// We therefore take the SECOND-to-last entry: the last one is the proxy node
// we trust to have appended it, so the one before it is the address that node
// actually saw connecting. Anything a client prepends to its own XFF header
// lands further left and cannot influence this position. We deliberately do
// not use the first entry (client-forgeable) nor x-real-ip (observed to be
// unreliable on Railway).
//
// Assumes exactly one trusted appender at the end of the chain; if the
// platform adds another hop, this position must be revisited.
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(this.clientIp(req))
  }

  protected clientIp(req: Record<string, any>): string {
    const header = req.headers?.['x-forwarded-for']
    const raw = Array.isArray(header) ? header.join(',') : header
    const chain =
      typeof raw === 'string'
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []

    return chain.length >= 2 ? chain[chain.length - 2] : req.ip
  }
}
