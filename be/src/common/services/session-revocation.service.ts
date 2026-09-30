import { Injectable } from '@nestjs/common'
import ms, { StringValue } from 'ms'
import envConfig from '../config'
import { RedisService } from './redis.service'

const revokedUserKey = (userId: string) => `auth:revoked:user:${userId}`

// Access tokens are stateless JWTs, so a deactivated member's token would stay
// valid until it expires. Deactivation puts the userId on a Redis denylist that
// JwtStrategy and WsJwtGuard check. The key only needs to outlive the longest
// access token issued before deactivation, i.e. one full access-token lifetime.
// Refresh tokens are revoked outright, so no new access token can be minted.
@Injectable()
export class SessionRevocationService {
  constructor(private readonly redisService: RedisService) {}

  async revokeUser(userId: string) {
    const ttlSeconds = Math.ceil(ms(envConfig.ACCESS_TOKEN_EXPIRES_IN as StringValue) / 1000)
    await this.redisService.set(revokedUserKey(userId), true, ttlSeconds)

    // Same cleanup as AuthService.changePassword: drop every refresh token this
    // user holds, then the index set itself.
    const activeTokens = await this.redisService.getSetMembers(`auth:refresh:user:${userId}`)
    await Promise.all(activeTokens.map((token) => this.redisService.delete(`auth:refresh:${token}`)))
    await this.redisService.delete(`auth:refresh:user:${userId}`)
    return { revokedSessions: activeTokens.length }
  }

  async isUserRevoked(userId: string): Promise<boolean> {
    return (await this.redisService.get(revokedUserKey(userId))) !== null
  }
}
