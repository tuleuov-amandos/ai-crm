import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { ZodSerializerDto } from 'nestjs-zod'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import { ROLE } from 'src/common/constants/role.constanst'
import { MessageDto } from 'src/common/dto/message.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { RolesGuard } from 'src/common/guards/roles.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { AiSettingsResDto, UpdateAiSettingsBodyDto } from './ai-settings.dto'
import { AiSettingsService } from './ai-settings.service'

// Every PUT makes a call to the provider to check the key: 5/min (the same as
// BRUTE_FORCE_GUARD_THROTTLE) keeps the endpoint from serving as a key-checking
// oracle or from flooding the provider. With an explicit @Throttle the global
// guard counts by client IP, not by user (see ClientIpThrottlerGuard).
const AI_KEY_CHECK_THROTTLE = { default: { limit: 5, ttl: 60000 } }

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@ApiTags('AI settings')
@Controller('ai/settings')
export class AiSettingsController {
  constructor(private readonly aiSettingsService: AiSettingsService) {}

  // Every role may know whether AI is on; keyLast4 is added for ADMIN only.
  @Get()
  @ApiOkResponse({ type: AiSettingsResDto })
  @ZodSerializerDto(AiSettingsResDto)
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.aiSettingsService.get(user)
  }

  @UseGuards(RolesGuard)
  @Roles(ROLE.ADMIN)
  @Throttle(AI_KEY_CHECK_THROTTLE)
  @Put()
  @ApiOkResponse({ type: AiSettingsResDto })
  @ZodSerializerDto(AiSettingsResDto)
  update(@Body() body: UpdateAiSettingsBodyDto, @CurrentUser() user: AccessTokenPayload) {
    return this.aiSettingsService.update(user, body)
  }

  @UseGuards(RolesGuard)
  @Roles(ROLE.ADMIN)
  @Delete()
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  remove(@CurrentUser() user: AccessTokenPayload) {
    return this.aiSettingsService.remove(user)
  }
}
