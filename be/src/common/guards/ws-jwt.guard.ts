import { Injectable } from '@nestjs/common'
import { parse } from 'cookie'
import jwt from 'jsonwebtoken'
import { Socket } from 'socket.io'
import envConfig from 'src/common/config'
import { SessionRevocationService } from 'src/common/services/session-revocation.service'
import { AccessTokenPayload } from 'src/common/types/jwt.type'

export type WsAuthenticatedUser = Pick<AccessTokenPayload, 'userId' | 'role' | 'tenantId'>

// Not a Nest CanActivate guard: Passport's JwtAuthGuard runs per HTTP request
// via the HTTP execution context, which Socket.io events don't have. Instead
// this is called once from ChatGateway.handleConnection — the same
// cookie/JWT the REST API trusts (see JwtStrategy), verified up front so the
// rest of the connection's lifetime can trust `client.data.user`.
@Injectable()
export class WsJwtGuard {
  constructor(private readonly sessionRevocation: SessionRevocationService) {}

  async authenticate(client: Socket): Promise<WsAuthenticatedUser> {
    const cookieHeader = client.handshake.headers.cookie
    if (!cookieHeader) {
      throw new Error('Missing cookie header')
    }

    const { accessToken } = parse(cookieHeader)
    if (!accessToken) {
      throw new Error('Missing accessToken cookie')
    }

    const payload = jwt.verify(accessToken, envConfig.ACCESS_TOKEN_SECRET, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload

    if (await this.sessionRevocation.isUserRevoked(payload.userId)) {
      throw new Error('User access has been revoked')
    }

    return { userId: payload.userId, role: payload.role, tenantId: payload.tenantId }
  }
}
