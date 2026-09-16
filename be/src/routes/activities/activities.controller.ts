import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOkResponse, ApiConsumes } from '@nestjs/swagger'
import { ZodSerializerDto } from 'nestjs-zod'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { MessageDto } from 'src/common/dto/message.dto'
import { ACTIVITY_ATTACHMENT_MAX_BYTES } from 'src/common/services/cloudinary.service'
import { ActivitiesService } from './activities.service'
import {
  ActivityResDto,
  CreateActivityBodyDto,
  CreateActivityForContactBodyDto,
  CreateActivityForDealBodyDto,
  GetActivitiesQueryDto,
  GetActivitiesResDto,
  GetActivitiesPaginatedResDto,
  UpdateActivityBodyDto,
} from './activities.dto'

// ─── 1. CONTACT ACTIVITIES ────────────────────────────────────────────────────
@ApiTags('Activities - Contact')
@Controller('contacts/:contactId/activities')
@UseGuards(JwtAuthGuard, TenantStatusGuard)
export class ContactActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // POST /contacts/:contactId/activities
  @Post()
  @ApiOkResponse({ type: ActivityResDto })
  @ZodSerializerDto(ActivityResDto)
  createActivity(
    @CurrentUser() user: AccessTokenPayload,
    @Param('contactId') contactId: string,
    @Body() body: CreateActivityForContactBodyDto,
  ) {
    return this.activitiesService.createForContact(user.tenantId, contactId, user.userId, body, user)
  }

  // GET /contacts/:contactId/activities
  @Get()
  @ApiOkResponse({ type: GetActivitiesResDto })
  @ZodSerializerDto(GetActivitiesResDto)
  getActivities(@CurrentUser() user: AccessTokenPayload, @Param('contactId') contactId: string) {
    return this.activitiesService.getByContact(user.tenantId, contactId, user)
  }
}

// ─── 2. DEAL ACTIVITIES ───────────────────────────────────────────────────────
@ApiTags('Activities - Deal')
@Controller('deals/:dealId/activities')
@UseGuards(JwtAuthGuard, TenantStatusGuard)
export class DealActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // POST /deals/:dealId/activities
  @Post()
  @ApiOkResponse({ type: ActivityResDto })
  @ZodSerializerDto(ActivityResDto)
  createActivity(
    @CurrentUser() user: AccessTokenPayload,
    @Param('dealId') dealId: string,
    @Body() body: CreateActivityForDealBodyDto,
  ) {
    return this.activitiesService.createForDeal(user.tenantId, dealId, user.userId, body, user)
  }

  // GET /deals/:dealId/activities
  @Get()
  @ApiOkResponse({ type: GetActivitiesResDto })
  @ZodSerializerDto(GetActivitiesResDto)
  getActivities(@CurrentUser() user: AccessTokenPayload, @Param('dealId') dealId: string) {
    return this.activitiesService.getByDeal(user.tenantId, dealId, user)
  }
}

// ─── 3. GLOBAL ACTIVITIES ─────────────────────────────────────────────────────
@ApiTags('Activities')
@Controller('activities')
@UseGuards(JwtAuthGuard, TenantStatusGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // POST /activities — create a standalone activity (no contact/deal)
  @Post()
  @ApiOkResponse({ type: ActivityResDto })
  @ZodSerializerDto(ActivityResDto)
  createActivity(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateActivityBodyDto) {
    return this.activitiesService.create(user.tenantId, user.userId, body)
  }

  // GET /activities?page=1&limit=20&type=CALL&search=...&contactId=...&dealId=...
  // Declare before PATCH/DELETE :id so NestJS matches correctly
  @Get()
  @ApiOkResponse({ type: GetActivitiesPaginatedResDto })
  @ZodSerializerDto(GetActivitiesPaginatedResDto)
  getAll(@CurrentUser() user: AccessTokenPayload, @Query() query: GetActivitiesQueryDto) {
    return this.activitiesService.getAll(user.tenantId, query, user)
  }

  // PATCH /activities/:id
  @Patch(':id')
  @ApiOkResponse({ type: ActivityResDto })
  @ZodSerializerDto(ActivityResDto)
  updateActivity(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') activityId: string,
    @Body() body: UpdateActivityBodyDto,
  ) {
    return this.activitiesService.updateActivity(activityId, user.tenantId, body, user)
  }

  // DELETE /activities/:id
  @Delete(':id')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  deleteActivity(@CurrentUser() user: AccessTokenPayload, @Param('id') activityId: string) {
    return this.activitiesService.deleteActivity(activityId, user.tenantId, user)
  }

  // PATCH /activities/:id/attachment — upload (or replace) the activity's single attachment
  @Patch(':id/attachment')
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: ActivityResDto })
  @ZodSerializerDto(ActivityResDto)
  @UseInterceptors(
    FileInterceptor('file', {
      // Hard cap so an oversized body is dropped before buffering the whole
      // file in memory; the service re-checks and returns a localizable error.
      limits: { fileSize: ACTIVITY_ATTACHMENT_MAX_BYTES },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') activityId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.activitiesService.uploadAttachment(activityId, user.tenantId, file, user)
  }

  // DELETE /activities/:id/attachment
  @Delete(':id/attachment')
  @ApiOkResponse({ type: ActivityResDto })
  @ZodSerializerDto(ActivityResDto)
  removeAttachment(@CurrentUser() user: AccessTokenPayload, @Param('id') activityId: string) {
    return this.activitiesService.removeAttachment(activityId, user.tenantId, user)
  }
}
