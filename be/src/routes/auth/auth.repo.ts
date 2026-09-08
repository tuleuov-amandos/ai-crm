import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { RoleType } from 'src/common/constants/role.constanst'

@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findUserByEmail(email: string) {
    const user = await this.prismaService.user.findUnique({
      where: { email },
      include: { role: true },
    })
    if (!user) {
      return null
    }
    return {
      ...user,
      role: user.role.name as RoleType,
    }
  }

  async findRefreshTokenIncludeUser(refreshToken: string): Promise<any> {
    const tokenRecord = await this.prismaService.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { tenant: true, role: true } } },
    })
    if (!tokenRecord) return null
    return {
      ...tokenRecord,
      user: {
        ...tokenRecord.user,
        role: tokenRecord.user.role.name,
      },
    }
  }
  async deleteRefreshToken(token: string) {
    return await this.prismaService.refreshToken.delete({
      where: { token },
    })
  }
}
