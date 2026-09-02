import { Body, Controller, Delete, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiConsumes, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { LOGO_MAX_BYTES } from 'src/common/services/cloudinary.service'
import { TenantsService } from './tenants.service'
import { UpdateTenantDto } from './tenants.dto'

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  // Any authenticated member of the workspace may read its profile; the write
  // endpoints below enforce ADMIN (`manage:all`) in the service via CASL.

  @Get('me')
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.tenantsService.getMe(user.tenantId)
  }

  @Patch('me')
  updateMe(@Body() body: UpdateTenantDto, @CurrentUser() user: AccessTokenPayload) {
    return this.tenantsService.updateMe(user, body)
  }

  @Post('me/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      // Hard cap so an oversized body is dropped before buffering the whole
      // file in memory; the service re-checks and returns a localizable error.
      limits: { fileSize: LOGO_MAX_BYTES },
    }),
  )
  updateLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AccessTokenPayload) {
    return this.tenantsService.updateLogo(user, file)
  }

  @Delete('me/logo')
  removeLogo(@CurrentUser() user: AccessTokenPayload) {
    return this.tenantsService.removeLogo(user)
  }
}
