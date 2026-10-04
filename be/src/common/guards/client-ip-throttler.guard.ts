import { ExecutionContext, Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants'
import jwt from 'jsonwebtoken'
import envConfig from 'src/common/config'
import { AccessTokenPayload } from 'src/common/types/jwt.type'

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
//
// Authenticated requests are counted per user instead, so colleagues behind one
// office NAT don't share a single IP bucket. The access-token cookie is
// verified by signature only (same as WsJwtGuard): a forged or tampered token
// fails verification and is counted by IP, so it cannot be used to dodge the
// IP limit. No DB/Redis lookups happen here (a revoked-but-unexpired token is
// still counted per user; that is harmless for rate limiting). Prefixes keep
// the "user:" and "ip:" key spaces from ever colliding.
//
// Routes with an explicit @Throttle override (login, register, refresh, password
// flows, invitations, platform-admin: the brute-force-sensitive ones) ALWAYS use
// the IP tracker, even with a valid token. Otherwise an attacker could register
// many accounts and get a fresh per-user bucket for each, detaching the limit
// from the IP. ThrottlerGuard calls getTracker(req, context), so we read the
// same THROTTLER:LIMIT<name> metadata the base guard uses (handler first, then
// class) for each configured throttler to detect an override.
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>, context?: ExecutionContext): Promise<string> {
    const userId = context && this.hasExplicitThrottle(context) ? null : this.verifiedUserId(req)
    return Promise.resolve(userId ? `user:${userId}` : `ip:${this.clientIp(req)}`)
  }

  private hasExplicitThrottle(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()]
    const names = this.throttlers?.length ? this.throttlers.map((t) => t.name ?? 'default') : ['default']
    return names.some((name) => this.reflector.getAllAndOverride(THROTTLER_LIMIT + name, targets) !== undefined)
  }

  private verifiedUserId(req: Record<string, any>): string | null {
    const token = req.cookies?.accessToken
    if (typeof token !== 'string' || !token) return null

    try {
      const payload = jwt.verify(token, envConfig.ACCESS_TOKEN_SECRET, {
        algorithms: ['HS256'],
      }) as AccessTokenPayload
      return typeof payload.userId === 'string' && payload.userId ? payload.userId : null
    } catch {
      return null
    }
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
