import jwt from 'jsonwebtoken'
import { Socket } from 'socket.io'
import envConfig from '../config'
import { JwtStrategy } from 'src/routes/auth/strategies/jwt.strategy'
import { WsJwtGuard } from '../guards/ws-jwt.guard'
import { RedisService } from './redis.service'
import { SessionRevocationService } from './session-revocation.service'

describe('SessionRevocationService', () => {
  const redis = {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    getSetMembers: jest.fn(),
  }
  const service = new SessionRevocationService(redis as unknown as RedisService)

  beforeEach(() => {
    jest.clearAllMocks()
    redis.get.mockResolvedValue(null)
    redis.getSetMembers.mockResolvedValue(['rt-1', 'rt-2'])
  })

  it('denylists the user for one access-token lifetime and drops every refresh token', async () => {
    await expect(service.revokeUser('u1')).resolves.toEqual({ revokedSessions: 2 })

    // ACCESS_TOKEN_EXPIRES_IN is '15m' in test/jest-setup-env.ts
    expect(redis.set).toHaveBeenCalledWith('auth:revoked:user:u1', true, 15 * 60)
    expect(redis.delete).toHaveBeenCalledWith('auth:refresh:rt-1')
    expect(redis.delete).toHaveBeenCalledWith('auth:refresh:rt-2')
    expect(redis.delete).toHaveBeenCalledWith('auth:refresh:user:u1')
  })

  it('reports whether a user is denylisted', async () => {
    await expect(service.isUserRevoked('u1')).resolves.toBe(false)
    redis.get.mockResolvedValue(true)
    await expect(service.isUserRevoked('u1')).resolves.toBe(true)
    expect(redis.get).toHaveBeenCalledWith('auth:revoked:user:u1')
  })

  describe('enforcement', () => {
    const payload = { userId: 'u1', role: 'SALES_REP', tenantId: 't1' }

    it('JwtStrategy rejects a revoked user and passes an active one', async () => {
      const strategy = new JwtStrategy(service)
      await expect(strategy.validate(payload)).resolves.toEqual(payload)
      redis.get.mockResolvedValue(true)
      await expect(strategy.validate(payload)).resolves.toBeNull()
    })

    it('WsJwtGuard rejects a revoked user and passes an active one', async () => {
      const token = jwt.sign(payload, envConfig.ACCESS_TOKEN_SECRET, { algorithm: 'HS256', expiresIn: '15m' })
      const client = { handshake: { headers: { cookie: `accessToken=${token}` } } } as unknown as Socket
      const guard = new WsJwtGuard(service)

      await expect(guard.authenticate(client)).resolves.toEqual(payload)
      redis.get.mockResolvedValue(true)
      await expect(guard.authenticate(client)).rejects.toThrow('User access has been revoked')
    })
  })
})
