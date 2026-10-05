import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { ZodSerializerDto } from 'nestjs-zod'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { Roles } from 'src/common/decorators/roles.decorator'
import { ROLE } from 'src/common/constants/role.constanst'
import { MessageDto } from 'src/common/dto/message.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { RolesGuard } from 'src/common/guards/roles.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import {
  CreatePipelineStageBodyDto,
  DeletePipelineStageQueryDto,
  GetPipelineStagesResDto,
  PipelineStageResDto,
  ReorderPipelineStagesBodyDto,
  UpdatePipelineStageBodyDto,
} from './pipeline-stages.dto'
import { PipelineStagesService } from './pipeline-stages.service'

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@ApiTags('Pipeline stages')
@Controller('pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly pipelineStagesService: PipelineStagesService) {}

  @Get()
  @ApiOkResponse({ type: GetPipelineStagesResDto })
  @ZodSerializerDto(GetPipelineStagesResDto)
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.pipelineStagesService.list(user)
  }

  @UseGuards(RolesGuard)
  @Roles(ROLE.ADMIN)
  @Post()
  @ApiOkResponse({ type: PipelineStageResDto })
  @ZodSerializerDto(PipelineStageResDto)
  create(@Body() body: CreatePipelineStageBodyDto, @CurrentUser() user: AccessTokenPayload) {
    return this.pipelineStagesService.create(user, body)
  }

  // Declared before `:id` so "reorder" is never captured as an id.
  @UseGuards(RolesGuard)
  @Roles(ROLE.ADMIN)
  @Patch('reorder')
  @ApiOkResponse({ type: GetPipelineStagesResDto })
  @ZodSerializerDto(GetPipelineStagesResDto)
  reorder(@Body() body: ReorderPipelineStagesBodyDto, @CurrentUser() user: AccessTokenPayload) {
    return this.pipelineStagesService.reorder(user, body)
  }

  @UseGuards(RolesGuard)
  @Roles(ROLE.ADMIN)
  @Patch(':id')
  @ApiOkResponse({ type: PipelineStageResDto })
  @ZodSerializerDto(PipelineStageResDto)
  update(@Param('id') id: string, @Body() body: UpdatePipelineStageBodyDto, @CurrentUser() user: AccessTokenPayload) {
    return this.pipelineStagesService.update(user, id, body)
  }

  @UseGuards(RolesGuard)
  @Roles(ROLE.ADMIN)
  @Delete(':id')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  remove(
    @Param('id') id: string,
    @Query() query: DeletePipelineStageQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.pipelineStagesService.remove(user, id, query)
  }
}
