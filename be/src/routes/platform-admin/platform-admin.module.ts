import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { CommonModule } from 'src/common/common.module'
import { PlatformAdminService } from './platform-admin.service'
import { PlatformAdminController } from './platform-admin.controller'
import { PlatformAdminJwtStrategy } from './strategies/platform-admin-jwt.strategy'

@Module({
  imports: [CommonModule, JwtModule.register({})],
  providers: [PlatformAdminService, PlatformAdminJwtStrategy],
  controllers: [PlatformAdminController],
})
export class PlatformAdminModule {}
