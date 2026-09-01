import { Body, Controller, Get, Post, UseGuards, Req, Res } from '@nestjs/common'
import { ApiTags, ApiOkResponse } from '@nestjs/swagger'
import { Response, Request } from 'express'
import { ZodSerializerDto } from 'nestjs-zod'
import { LoginBodyDto, RegisterBodyDto, RegisterResDto } from './auth.dto'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { RolesGuard } from 'src/common/guards/roles.guard'
import { Roles } from 'src/common/decorators/roles.decorator'
import { ROLE } from 'src/common/constants/role.constanst'
import { MessageDto } from 'src/common/dto/message.dto'
import { COOKIE_OPTIONS } from './auth.constants'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { AuthGuard } from '@nestjs/passport'
import { Throttle } from '@nestjs/throttler'
import { rootLogger } from 'src/common/logger/root-logger'

const BRUTE_FORCE_GUARD_THROTTLE = { default: { limit: 5, ttl: 60000 } }

// Module-level logger; `requestId` is attached from CLS per request. Cookie
// values, tokens and `req.user.accessToken` (Google) are never logged.
const log = rootLogger.child({ context: 'AuthController' })

interface GoogleAuthRequest extends Request {
  user: {
    provider: string
    providerAccountId: string
    email: string
    emailVerified: boolean
    name: string
    picture?: string
    accessToken: string
  }
}

// COOKIE_OPTIONS moved to auth.constants to avoid circular imports

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(BRUTE_FORCE_GUARD_THROTTLE)
  @ApiOkResponse({ type: RegisterResDto })
  @ZodSerializerDto(RegisterResDto)
  register(@Body() body: RegisterBodyDto) {
    return this.authService.register(body)
  }

  @Post('login')
  @Throttle(BRUTE_FORCE_GUARD_THROTTLE)
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  async login(@Body() body: LoginBodyDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.authService.login(body)

    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000, // 15 minutes
    })

    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    log.info({ event: 'login.cookies_set', email: body.email })
    return { message: 'Đăng nhập thành công' }
  }

  @Post('logout')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  logout(@Res({ passthrough: true }) res: Response, @Req() req: Request) {
    const refreshToken = req.cookies['refreshToken']

    res.clearCookie('accessToken', COOKIE_OPTIONS)
    res.clearCookie('refreshToken', COOKIE_OPTIONS)
    log.info({ event: 'logout.cookies_cleared' })

    return this.authService.logout(refreshToken)
  }

  @Post('refresh-token')
  @Throttle(BRUTE_FORCE_GUARD_THROTTLE)
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  async refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies.refreshToken
    return this.authService.refreshToken(refreshToken, res)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getProfile(user.userId)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.MANAGER)
  @Get('admin')
  getAdminProfile(@CurrentUser() user: AccessTokenPayload) {
    return { message: 'Đường dẫn cho ADMIN', user }
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Flow automatically redirects to Google Login
  }
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: GoogleAuthRequest, @Res({ passthrough: true }) res: Response) {
    // req.user contains info returned by GoogleStrategy in validate()
    const user = await this.authService.validateGoogleUser(req.user)
    log.info({ event: 'google.callback_ok', userId: user.id, tenantId: user.tenantId })
    // Generate accessToken and refreshToken similar to traditional login
    const { accessToken, refreshToken } = await this.authService.generateTokens({
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId,
    })
    // Set cookies similar to login
    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    })
    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    // Redirect user to the frontend home page
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000')
  }
}
