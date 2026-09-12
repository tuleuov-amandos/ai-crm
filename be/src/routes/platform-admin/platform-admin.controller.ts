import { Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Response, Request } from 'express'
import { Throttle } from '@nestjs/throttler'
import { COOKIE_OPTIONS } from 'src/routes/auth/auth.constants'
import { PlatformAdminService } from './platform-admin.service'
import { LoginBodyDto, UpdateTenantStatusDto } from './platform-admin.dto'
import { PlatformAdminAuthGuard } from './guards/platform-admin-auth.guard'

const BRUTE_FORCE_GUARD_THROTTLE = { default: { limit: 5, ttl: 60000 } }

interface PlatformAdminRequest extends Request {
  user: {
    platformAdminId: string
  }
}

/**
 * Superadmin login/session, entirely separate from the tenant auth stack
 * (`routes/auth`): own cookie ('platformAdminToken' vs 'accessToken'), own
 * Passport strategy ('platform-admin-jwt' vs 'jwt'), own JWT secret. There is
 * no PlatformAdmin role in the tenant Role model — a PlatformAdmin is not a
 * User and has no tenantId.
 */
@ApiExcludeController()
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly service: PlatformAdminService) {}

  @Post('login')
  @Throttle(BRUTE_FORCE_GUARD_THROTTLE)
  async login(@Body() body: LoginBodyDto, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.service.login(body)

    res.cookie('platformAdminToken', token, {
      ...COOKIE_OPTIONS,
      maxAge: 8 * 60 * 60 * 1000, // 8 часов
    })

    return { message: 'Logged in' }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('platformAdminToken', COOKIE_OPTIONS)
    return { message: 'Logged out' }
  }

  @UseGuards(PlatformAdminAuthGuard)
  @Get('me')
  async me(@Req() req: PlatformAdminRequest) {
    return this.service.getMe(req.user.platformAdminId)
  }

  @UseGuards(PlatformAdminAuthGuard)
  @Get('tenants')
  async getTenants() {
    return this.service.getTenants()
  }

  @UseGuards(PlatformAdminAuthGuard)
  @Patch('tenants/:id/status')
  async updateStatus(@Param('id') id: string, @Body() body: UpdateTenantStatusDto) {
    return this.service.updateTenantStatus(id, body.status)
  }
}
